import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import {
	GetBalanceResultSchema,
	InvoiceBolt11ResultSchema,
	InvoiceBolt12OfferResultSchema,
	InvoiceCreateBolt11InputSchema,
	InvoiceCreateBolt12OfferInputSchema,
	NodeEventSchema,
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
	.output(PayoutResultSchema);

export const invoiceCreateBolt11Contract = oc
	.input(InvoiceCreateBolt11InputSchema)
	.output(InvoiceBolt11ResultSchema);

export const invoiceCreateBolt12OfferContract = oc
	.input(InvoiceCreateBolt12OfferInputSchema)
	.output(InvoiceBolt12OfferResultSchema);

/**
 * Read the merchant node's spendable (outbound) balance.
 *
 * Deliberately not yet wired into the `nodeControl` router export below: the
 * SDK's `implement(nodeControl).router({...})` is exhaustive, so wiring here
 * without the matching handler in @moneydevkit/core would break the workspace
 * build. The wire-up lands together with the handler in the implementation PR.
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
	events: nodeEventsContract,
};
