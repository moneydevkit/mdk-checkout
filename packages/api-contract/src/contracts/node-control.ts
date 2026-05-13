import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import {
	GetBalanceResultSchema,
	InvoiceBolt11ResultSchema,
	InvoiceBolt12OfferResultSchema,
	InvoiceCreateBolt11InputSchema,
	InvoiceCreateBolt12OfferInputSchema,
	NodeEventSchema,
	PayoutFailureDataSchema,
	PayoutInputSchema,
	PayoutResultSchema,
	ProgrammaticPayoutInputSchema,
} from "../schemas/node-control";

/**
 * Node control contract used over a WebSocket between mdk.com (RPC client) and
 * a merchant's running lightning-js node (RPC handler).
 */
export const payoutContract = oc
	.input(PayoutInputSchema)
	.output(PayoutResultSchema);

/**
 * Programmatic payout command carrying an explicit trusted destination.
 */
export const programmaticPayoutContract = oc
	.input(ProgrammaticPayoutInputSchema)
	.errors({
		NODE_NOT_READY: {
			message: "node has not finished startReceiving yet",
		},
		DRAINING: {
			message: "node is in drain window; retry on next session",
		},
		PROGRAMMATIC_PAYOUT_DESTINATION_UNSET: {
			message: "payout destination is required",
		},
		PAYOUT_FAILED: {
			message: "payout failed",
			data: PayoutFailureDataSchema,
		},
	})
	.output(PayoutResultSchema);

export const invoiceCreateBolt11Contract = oc
	.input(InvoiceCreateBolt11InputSchema)
	.output(InvoiceBolt11ResultSchema);

export const invoiceCreateBolt12OfferContract = oc
	.input(InvoiceCreateBolt12OfferInputSchema)
	.output(InvoiceBolt12OfferResultSchema);

/**
 * Read the merchant node's spendable (outbound) balance.
 */
export const getBalanceContract = oc
	.input(z.void())
	.output(GetBalanceResultSchema);

/** Server-pushed event stream. Single subscriber per session, buffered, FIFO. */
export const nodeEventsContract = oc
	.input(z.void())
	.output(eventIterator(NodeEventSchema));

export const nodeControl = {
	payout: payoutContract,
	programmaticPayout: programmaticPayoutContract,
	invoice: {
		createBolt11: invoiceCreateBolt11Contract,
		createBolt12Offer: invoiceCreateBolt12OfferContract,
	},
	getBalance: getBalanceContract,
	events: nodeEventsContract,
};
