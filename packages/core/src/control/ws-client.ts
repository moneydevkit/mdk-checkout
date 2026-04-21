import { experimental_RPCHandler as RPCHandler } from '@orpc/server/ws'
import { WebSocket } from 'ws'

import { nodeControlRouter } from './handlers'
import type { CmdQueue, EventQueue, SessionState } from './queue'

/**
 * Options for connectControl. Caller resolves URL and accessToken from env.
 *
 * queue/eventQueue/sessionState/env are passed in BEFORE the WS opens because
 * the oRPC handler must be attached atomically with lease.granted - any gap
 * between handler attach and the resolved connection lets mdk.com call events()
 * or any RPC and land on dead air. See plan §"Bootstrapping race".
 */
export type ConnectControlOptions = {
	url: string
	accessToken: string
	queue: CmdQueue
	eventQueue: EventQueue
	sessionState: SessionState
	env: { WITHDRAWAL_DESTINATION: string | undefined }
	leaseTimeoutMs?: number
}

/**
 * Result of the lease handshake.
 * - 'lease-denied': mdk.com closed the WS during handshake (4001 lease held,
 *   4003 unauthorised, etc). The merchant function MUST NOT construct the node.
 * - 'ok': lease granted, RPC handler attached, safe to construct node and run loop.
 */
export type ConnectResult =
	| { status: 'lease-denied'; code?: number; reason?: string }
	| { status: 'ok'; client: WsClient }

export type WsClient = {
	readonly closed: boolean
	close: (flushTimeoutMs?: number) => Promise<void>
	startDraining: () => void
}

const LEASE_GRANTED = 'lease.granted'
const DEFAULT_LEASE_TIMEOUT_MS = 10_000

/**
 * Dial mdk.com, await lease.granted, attach oRPC handler atomically.
 *
 * On success: the returned client wraps the live socket. The oRPC handler is
 * already attached, so mdk.com can call events() or any RPC immediately.
 * Command RPCs reject with NODE_NOT_READY until the caller flips
 * sessionState.nodeReady = true (after node.startReceiving completes).
 *
 * On lease-denied: returns without an attached handler. Caller should exit
 * without constructing the node.
 *
 * Throws on network errors or lease handshake timeout.
 */
export function connectControl(opts: ConnectControlOptions): Promise<ConnectResult> {
	const ws = new WebSocket(opts.url, {
		headers: { Authorization: `Bearer ${opts.accessToken}` },
	})
	const timeoutMs = opts.leaseTimeoutMs ?? DEFAULT_LEASE_TIMEOUT_MS

	return new Promise<ConnectResult>((resolve, reject) => {
		let settled = false
		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			ws.removeAllListeners()
			try {
				ws.close(4002, 'lease handshake timeout')
			} catch {
				// best effort
			}
			reject(new Error(`lease.granted not received within ${timeoutMs}ms`))
		}, timeoutMs)

		const cleanup = () => {
			clearTimeout(timer)
			ws.off('error', onError)
			ws.off('close', onCloseDuringHandshake)
			ws.off('unexpected-response', onUnexpectedResponse)
			ws.off('message', onMessage)
		}

		const onError = (err: Error) => {
			if (settled) return
			settled = true
			cleanup()
			reject(err)
		}

		const onCloseDuringHandshake = (code: number, reason: Buffer) => {
			if (settled) return
			settled = true
			cleanup()
			// 4001 = lease held, 4003 = unauthorised. Treat as denied (caller decides).
			resolve({ status: 'lease-denied', code, reason: reason.toString('utf-8') })
		}

		const onUnexpectedResponse = (_req: unknown, res: { statusCode?: number }) => {
			if (settled) return
			settled = true
			cleanup()
			resolve({
				status: 'lease-denied',
				code: res.statusCode,
				reason: `unexpected http response ${res.statusCode}`,
			})
		}

		const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
			if (settled) return
			let parsed: { type?: unknown }
			try {
				const text = Array.isArray(data)
					? Buffer.concat(data).toString('utf-8')
					: typeof data === 'string'
						? data
						: Buffer.from(data as ArrayBuffer).toString('utf-8')
				parsed = JSON.parse(text)
			} catch {
				return // ignore non-JSON garbage during handshake
			}
			if (parsed.type !== LEASE_GRANTED) return

			settled = true
			cleanup()

			// ATOMIC: attach the oRPC handler before resolving with 'ok'.
			// By the time the caller can act on the resolved value, mdk.com can
			// call any RPC and find a handler waiting.
			const handler = new RPCHandler(nodeControlRouter)
			void handler.upgrade(ws, {
				context: {
					queue: opts.queue,
					eventQueue: opts.eventQueue,
					sessionState: opts.sessionState,
					env: opts.env,
				},
			})

			let closed = false
			const client: WsClient = {
				get closed() {
					return closed
				},
				startDraining: () => {
					opts.sessionState.draining = true
				},
				close: async (flushTimeoutMs = 1000) => {
					if (closed) return
					closed = true
					// Flush events first so leaseReleased reaches mdk.com.
					await opts.eventQueue.close(flushTimeoutMs)
					try {
						ws.close(1000, 'session ended')
					} catch {
						// already closing/closed; fine
					}
				},
			}

			// Reflect external close (mdk.com closed us, network error, etc.)
			// onto the client so the unified loop can exit.
			ws.on('close', () => {
				closed = true
				// Force-close the event queue so the events() iterator returns done
				// even if no graceful close was issued.
				void opts.eventQueue.close(0)
			})

			resolve({ status: 'ok', client })
		}

		ws.on('error', onError)
		ws.on('close', onCloseDuringHandshake)
		ws.on('unexpected-response', onUnexpectedResponse)
		ws.on('message', onMessage)
	})
}
