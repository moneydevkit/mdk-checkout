import { z } from "zod";

/**
 * Input for the payout command. Destination is NOT in the payload - the node-side
 * handler reads it from process.env.WITHDRAWAL_DESTINATION. This means mdk.com cannot
 * direct funds to an arbitrary destination even if the per-app key is compromised.
 *
 * amountMsat is required and positive; "drain entire balance" semantics are out of v1.
 * If needed later, add a separate explicit command (e.g. payout.drainAll).
 */
export const PayoutInputSchema = z.object({
	amountMsat: z.number().int().positive(),
	idempotencyKey: z.string(),
});
export type PayoutInput = z.infer<typeof PayoutInputSchema>;

/**
 * Result of a payout command. Returned synchronously after the underlying
 * payWhileRunning(_, _, 0) fire-and-forget call. The final outcome (Sent or Failed)
 * arrives later as a paymentSent or paymentFailed event over the events() iterator.
 */
export const PayoutResultSchema = z.object({
	accepted: z.literal(true),
	paymentId: z.string(),
	paymentHash: z.string().nullable(),
});
export type PayoutResult = z.infer<typeof PayoutResultSchema>;

/**
 * Input for createBolt11. amountMsat null means a variable-amount JIT invoice.
 */
export const InvoiceCreateBolt11InputSchema = z.object({
	amountMsat: z.number().int().positive().nullable(),
	description: z.string(),
	expirySecs: z.number().int().positive(),
	idempotencyKey: z.string(),
});
export type InvoiceCreateBolt11Input = z.infer<
	typeof InvoiceCreateBolt11InputSchema
>;

/**
 * Result of createBolt11. expiresAt is a unix timestamp in seconds (matches lightning-js).
 */
export const InvoiceBolt11ResultSchema = z.object({
	bolt11: z.string(),
	paymentHash: z.string(),
	expiresAt: z.number(),
	scid: z.string(),
});
export type InvoiceBolt11Result = z.infer<typeof InvoiceBolt11ResultSchema>;

/**
 * Input for createBolt12Offer. amountMsat null means a variable-amount offer.
 */
export const InvoiceCreateBolt12OfferInputSchema = z.object({
	amountMsat: z.number().int().positive().nullable(),
	description: z.string(),
	expirySecs: z.number().int().positive().optional(),
	idempotencyKey: z.string(),
});
export type InvoiceCreateBolt12OfferInput = z.infer<
	typeof InvoiceCreateBolt12OfferInputSchema
>;

export const InvoiceBolt12OfferResultSchema = z.object({
	offer: z.string(),
});
export type InvoiceBolt12OfferResult = z.infer<
	typeof InvoiceBolt12OfferResultSchema
>;

/**
 * Events pushed from the node to mdk.com over the events() AsyncIterable.
 *
 * - ready: emitted once after node.startReceiving() + setupBolt12Receive() complete.
 * - paymentSent / paymentFailed: outbound payment outcomes. Correlate by paymentId.
 * - draining: emitted when the node enters its drain window.
 * - leaseReleased: emitted right before the node initiates a graceful shutdown.
 */
export const NodeEventSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ready"), nodeId: z.string() }),
	z.object({
		type: z.literal("paymentSent"),
		paymentId: z.string(),
		paymentHash: z.string(),
		preimage: z.string(),
	}),
	z.object({
		type: z.literal("paymentFailed"),
		paymentId: z.string(),
		paymentHash: z.string(),
		reason: z.string().optional(),
	}),
	z.object({ type: z.literal("draining") }),
	z.object({ type: z.literal("leaseReleased") }),
]);
export type NodeEvent = z.infer<typeof NodeEventSchema>;
