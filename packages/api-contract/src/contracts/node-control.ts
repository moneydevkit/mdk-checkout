import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import {
	InvoiceBolt11ResultSchema,
	InvoiceBolt12OfferResultSchema,
	InvoiceCreateBolt11InputSchema,
	InvoiceCreateBolt12OfferInputSchema,
	NodeEventSchema,
	PayoutInputSchema,
	PayoutResultSchema,
} from "../schemas/node-control";

/**
 * Node control contract used over a WebSocket between mdk.com (RPC client) and
 * a merchant's running lightning-js node (RPC handler).
 */
export const payoutContract = oc
	.input(PayoutInputSchema)
	.output(PayoutResultSchema);

export const invoiceCreateBolt11Contract = oc
	.input(InvoiceCreateBolt11InputSchema)
	.output(InvoiceBolt11ResultSchema);

export const invoiceCreateBolt12OfferContract = oc
	.input(InvoiceCreateBolt12OfferInputSchema)
	.output(InvoiceBolt12OfferResultSchema);

/** Server-pushed event stream. Single subscriber per session, buffered, FIFO. */
export const nodeEventsContract = oc
	.input(z.void())
	.output(eventIterator(NodeEventSchema));

export const nodeControl = {
	payout: payoutContract,
	invoice: {
		createBolt11: invoiceCreateBolt11Contract,
		createBolt12Offer: invoiceCreateBolt12OfferContract,
	},
	events: nodeEventsContract,
};
