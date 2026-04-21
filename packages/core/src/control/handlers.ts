import { nodeControl } from '@moneydevkit/api-contract'
import { implement, ORPCError } from '@orpc/server'

import type { CmdQueue, EventQueue, SessionState } from './queue'

/**
 * Context injected into every RPC handler by the WS adapter. The unified loop
 * owns the actual node and consumes from `queue`. Handlers ONLY enqueue work
 * and await its promise; they never call into the NAPI layer themselves.
 * This is what enforces the single-NAPI-caller invariant.
 */
export type ControlContext = {
	queue: CmdQueue
	eventQueue: EventQueue
	sessionState: SessionState
	env: {
		WITHDRAWAL_DESTINATION: string | undefined
	}
}

/**
 * Reject an RPC call with a structured error. Codes are matched by mdk.com to
 * decide whether to retry or surface. Keep them stable.
 */
function rejectWith(code: string, message: string): never {
	throw new ORPCError(code, { message })
}

const impl = implement(nodeControl).$context<ControlContext>()

const payoutImpl = impl.payout.handler(({ input, context }) => {
	if (!context.sessionState.nodeReady) {
		rejectWith('NODE_NOT_READY', 'node has not finished startReceiving yet')
	}
	if (context.sessionState.draining) {
		rejectWith('DRAINING', 'node is in drain window; retry on next session')
	}
	const destination = context.env.WITHDRAWAL_DESTINATION
	if (!destination || destination.trim() === '') {
		rejectWith(
			'WITHDRAWAL_DESTINATION_UNSET',
			'WITHDRAWAL_DESTINATION env var is not set on the merchant function',
		)
	}
	return new Promise<{
		accepted: true
		paymentId: string
		paymentHash: string | null
	}>((resolve, reject) => {
		context.queue.push({
			kind: 'payout',
			destination: destination as string,
			amountMsat: input.amountMsat,
			resolve,
			reject,
		})
	})
})

const createBolt11Impl = impl.invoice.createBolt11.handler(({ input, context }) => {
	if (!context.sessionState.nodeReady) {
		rejectWith('NODE_NOT_READY', 'node has not finished startReceiving yet')
	}
	if (context.sessionState.draining) {
		rejectWith('DRAINING', 'node is in drain window; retry on next session')
	}
	return new Promise<{
		bolt11: string
		paymentHash: string
		expiresAt: number
		scid: string
	}>((resolve, reject) => {
		context.queue.push({
			kind: 'createBolt11',
			amountMsat: input.amountMsat,
			description: input.description,
			expirySecs: input.expirySecs,
			resolve,
			reject,
		})
	})
})

const createBolt12OfferImpl = impl.invoice.createBolt12Offer.handler(
	({ input, context }) => {
		if (!context.sessionState.nodeReady) {
			rejectWith('NODE_NOT_READY', 'node has not finished startReceiving yet')
		}
		if (context.sessionState.draining) {
			rejectWith('DRAINING', 'node is in drain window; retry on next session')
		}
		return new Promise<{ offer: string }>((resolve, reject) => {
			context.queue.push({
				kind: 'createBolt12Offer',
				amountMsat: input.amountMsat,
				description: input.description,
				expirySecs: input.expirySecs,
				resolve,
				reject,
			})
		})
	},
)

/**
 * events() yields from the EventQueue's AsyncIterable. Safe to subscribe BEFORE
 * nodeReady - it just yields nothing until events arrive (the first will be
 * `ready`). Single subscriber per session (EventQueue enforces this).
 */
const eventsImpl = impl.events.handler(async function* ({ context }) {
	for await (const event of context.eventQueue.subscribe()) {
		yield event
	}
})

export const nodeControlRouter = impl.router({
	payout: payoutImpl,
	invoice: {
		createBolt11: createBolt11Impl,
		createBolt12Offer: createBolt12OfferImpl,
	},
	events: eventsImpl,
})

export type NodeControlRouter = typeof nodeControlRouter
