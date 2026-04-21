import type {
	InvoiceBolt11Result,
	InvoiceBolt12OfferResult,
	NodeEvent,
	PayoutResult,
} from '@moneydevkit/api-contract'

/**
 * Discriminated union of commands enqueued by oRPC handlers and drained by the
 * unified event loop. Every command carries a Promise resolver pair so the
 * handler can await its result while the loop runs the actual NAPI call.
 *
 * All amounts are msats (no unit conversion). amountMsat is required positive
 * for payout; nullable for invoice/offer creation where null means
 * variable-amount (LSPS4 JIT).
 */
export type Cmd =
	| {
			kind: 'payout'
			destination: string
			amountMsat: number
			resolve: (value: PayoutResult) => void
			reject: (err: Error) => void
	  }
	| {
			kind: 'createBolt11'
			amountMsat: number | null
			description: string
			expirySecs: number
			resolve: (value: InvoiceBolt11Result) => void
			reject: (err: Error) => void
	  }
	| {
			kind: 'createBolt12Offer'
			amountMsat: number | null
			description: string
			expirySecs: number | undefined
			resolve: (value: InvoiceBolt12OfferResult) => void
			reject: (err: Error) => void
	  }

/**
 * Plain FIFO queue of commands. The unified loop is the sole consumer; oRPC
 * handlers are the producers. No locking needed because all operations happen
 * on the JS event loop's single thread.
 */
export class CmdQueue {
	private items: Cmd[] = []

	push(cmd: Cmd): void {
		this.items.push(cmd)
	}

	shift(): Cmd | undefined {
		return this.items.shift()
	}

	get size(): number {
		return this.items.length
	}
}

/**
 * Mutable session state shared across the WS handler and the unified loop.
 * - nodeReady flips true after node.startReceiving() + setupBolt12Receive()
 *   complete. RPC handlers reject with 'node-not-ready' until then. Closes the
 *   bootstrap-race window between handler attach and node start.
 * - draining flips true when the deadline (sessionStart + 300s - 15s) is
 *   reached. RPC handlers reject with 'draining' to give in-flight commands
 *   time to settle before the function is killed.
 */
export type SessionState = {
	nodeReady: boolean
	draining: boolean
}

/**
 * Single-subscriber event queue with start-buffering and graceful flush.
 *
 * Design constraints (see plan):
 * - Single subscriber per session: subscribe() throws if called twice. mdk.com
 *   calls events() exactly once per WS session.
 * - Buffered from session start: events pushed before any subscriber are
 *   queued and delivered in order to the first subscriber. Avoids losing
 *   `ready` if mdk.com's events() call lands a few ms after lease.granted.
 * - FIFO across all event types.
 * - Graceful flush on close: close() drains buffered events to the subscriber
 *   (bounded ~1s) before completing. Required for `leaseReleased` to be
 *   reliably observable by mdk.com.
 * - close() is idempotent: first call performs flush+close, subsequent calls
 *   await the same in-flight close. Both the unified loop's quiet-shutdown
 *   path AND the outer finally call it.
 */
export class EventQueue {
	private buffered: NodeEvent[] = []
	private waker: (() => void) | null = null
	private subscribed = false
	private _closed = false
	private closePromise: Promise<void> | null = null

	push(event: NodeEvent): void {
		if (this._closed) return
		this.buffered.push(event)
		this.wake()
	}

	private wake(): void {
		if (this.waker) {
			const w = this.waker
			this.waker = null
			w()
		}
	}

	subscribe(): AsyncIterable<NodeEvent> {
		if (this.subscribed) {
			throw new Error('events() already subscribed for this session')
		}
		this.subscribed = true
		return {
			[Symbol.asyncIterator]: () => ({
				next: async (): Promise<IteratorResult<NodeEvent>> => {
					// Drain buffered events first, regardless of close state.
					// This is what makes leaseReleased observable: it's pushed
					// onto the queue right before close() runs.
					while (true) {
						if (this.buffered.length > 0) {
							const value = this.buffered.shift() as NodeEvent
							return { value, done: false }
						}
						if (this._closed) {
							return { value: undefined, done: true }
						}
						await new Promise<void>((resolve) => {
							this.waker = resolve
						})
					}
				},
			}),
		}
	}

	get closed(): boolean {
		return this._closed
	}

	/**
	 * Idempotent graceful close. First call drains buffered events to the
	 * subscriber (bounded by flushTimeoutMs), then marks the queue closed
	 * and wakes any pending consumer so the iterator returns done.
	 *
	 * Subsequent calls return the same in-flight promise: do NOT re-flush,
	 * do NOT throw. Required because both the quiet-shutdown path and the
	 * outer finally invoke close().
	 *
	 * Not declared async on purpose: an async function wraps its return value
	 * in a fresh Promise, defeating the identity guarantee. We return the
	 * stored promise object directly.
	 */
	close(flushTimeoutMs = 1000): Promise<void> {
		if (this.closePromise) return this.closePromise
		this.closePromise = (async () => {
			const deadline = Date.now() + flushTimeoutMs
			// Wake the subscriber so it pulls. Loop until either the buffer
			// drains or the timeout elapses. If there's no subscriber, this
			// just wastes flushTimeoutMs before close - acceptable for shutdown.
			while (this.buffered.length > 0 && Date.now() < deadline) {
				this.wake()
				await new Promise((r) => setTimeout(r, 10))
			}
			this._closed = true
			this.wake()
		})()
		return this.closePromise
	}
}
