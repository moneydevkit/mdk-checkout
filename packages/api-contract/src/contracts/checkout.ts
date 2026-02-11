import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	type CheckoutDetail,
	CheckoutDetailSchema,
	type CheckoutListItem,
	CheckoutListItemSchema,
	CheckoutSchema,
	type CheckoutStatus,
	CheckoutStatusSchema,
	type CheckoutType,
	CheckoutTypeSchema,
} from "../schemas/checkout";
import { CurrencySchema } from "../schemas/currency";
import {
	PaginatedInputSchema,
	PaginationOutputSchema,
} from "../schemas/pagination";

// Re-export entity schemas for backwards compatibility
export {
	CheckoutStatusSchema,
	CheckoutTypeSchema,
	CheckoutListItemSchema,
	CheckoutDetailSchema,
};
export type { CheckoutStatus, CheckoutType, CheckoutListItem, CheckoutDetail };

/**
 * Helper to treat empty strings as undefined (not provided).
 */
const emptyStringToUndefined = z
	.string()
	.transform((val) => (val.trim() === "" ? undefined : val));

/**
 * Email field that accepts empty strings (treated as undefined) or valid emails.
 */
const emailOrEmpty = z.string().email().optional().or(z.literal(""));

/**
 * Valid fields that can be required at checkout time.
 */
export const CustomerFieldSchema = z.string().min(1);
export type CustomerField = string;

/**
 * Customer data object for checkout input.
 */
export const CustomerInputSchema = z
	.object({
		name: emptyStringToUndefined.optional(),
		email: emailOrEmpty,
		externalId: emptyStringToUndefined.optional(),
	})
	.catchall(z.string());

export type CustomerInput = z.infer<typeof CustomerInputSchema>;

// Input schemas
export const CreateCheckoutInputSchema = z.object({
	nodeId: z.string(),
	amount: z.number().optional(),
	currency: CurrencySchema.optional(),
	products: z.array(z.string()).optional(),
	successUrl: z.string().optional(),
	allowDiscountCodes: z.boolean().optional(),
	metadata: z.record(z.string(), z.any()).optional(),
	customer: CustomerInputSchema.optional(),
	requireCustomerData: z.array(CustomerFieldSchema).optional(),
});

export const ConfirmCheckoutInputSchema = z.object({
	checkoutId: z.string(),
	customer: CustomerInputSchema.optional(),
	products: z
		.array(
			z.object({
				productId: z.string(),
				priceAmount: z.number().optional(),
			}),
		)
		.max(1)
		.optional(),
});

export const ApplyDiscountCodeInputSchema = z.object({
	checkoutId: z.string(),
	discountCode: z.string(),
});

export const RegisterInvoiceInputSchema = z.object({
	nodeId: z.string(),
	scid: z.string(),
	checkoutId: z.string(),
	invoice: z.string(),
	paymentHash: z.string(),
	invoiceExpiresAt: z.date(),
});

export const PaymentReceivedInputSchema = z.object({
	payments: z.array(
		z.object({
			paymentHash: z.string(),
			amountSats: z.number(),
			sandbox: z.boolean().default(false),
		}),
	),
});

export const GetCheckoutInputSchema = z.object({
	id: z.string().describe("The checkout ID"),
});
export type GetCheckoutInput = z.infer<typeof GetCheckoutInputSchema>;

export type CreateCheckout = z.infer<typeof CreateCheckoutInputSchema>;
export type ConfirmCheckout = z.infer<typeof ConfirmCheckoutInputSchema>;
export type RegisterInvoice = z.infer<typeof RegisterInvoiceInputSchema>;
export type PaymentReceived = z.infer<typeof PaymentReceivedInputSchema>;

// List output schemas
export const ListCheckoutsOutputSchema = z.object({
	checkouts: z.array(CheckoutSchema),
});
export type ListCheckoutsOutput = z.infer<typeof ListCheckoutsOutputSchema>;

export const ListCheckoutsPaginatedInputSchema = PaginatedInputSchema.extend({
	status: CheckoutStatusSchema.optional().describe(
		"Filter by status: UNCONFIRMED, CONFIRMED, PENDING_PAYMENT, PAYMENT_RECEIVED, or EXPIRED",
	),
});
export type ListCheckoutsPaginatedInput = z.infer<
	typeof ListCheckoutsPaginatedInputSchema
>;

export const ListCheckoutsPaginatedOutputSchema = PaginationOutputSchema.extend(
	{
		checkouts: z.array(CheckoutSchema),
	},
);
export type ListCheckoutsPaginatedOutput = z.infer<
	typeof ListCheckoutsPaginatedOutputSchema
>;

export const ListCheckoutsSummaryOutputSchema = PaginationOutputSchema.extend({
	checkouts: z.array(CheckoutListItemSchema),
});
export type ListCheckoutsSummaryOutput = z.infer<
	typeof ListCheckoutsSummaryOutputSchema
>;

// Contracts
export const createCheckoutContract = oc
	.input(CreateCheckoutInputSchema)
	.output(CheckoutSchema);

export const applyDiscountCodeContract = oc
	.input(ApplyDiscountCodeInputSchema)
	.output(CheckoutSchema);

export const confirmCheckoutContract = oc
	.input(ConfirmCheckoutInputSchema)
	.output(CheckoutSchema);

export const registerInvoiceContract = oc
	.input(RegisterInvoiceInputSchema)
	.output(CheckoutSchema);

export const getCheckoutContract = oc
	.input(GetCheckoutInputSchema)
	.output(CheckoutSchema);

export const paymentReceivedContract = oc
	.input(PaymentReceivedInputSchema)
	.output(z.object({ ok: z.boolean() }));

export const listCheckoutsContract = oc
	.input(z.object({}))
	.output(ListCheckoutsOutputSchema);

export const listCheckoutsPaginatedContract = oc
	.input(ListCheckoutsPaginatedInputSchema)
	.output(ListCheckoutsPaginatedOutputSchema);

export const listCheckoutsSummaryPaginatedContract = oc
	.input(ListCheckoutsPaginatedInputSchema)
	.output(ListCheckoutsSummaryOutputSchema);

export const getCheckoutDetailContract = oc
	.input(GetCheckoutInputSchema)
	.output(CheckoutDetailSchema);

export const checkout = {
	get: getCheckoutContract,
	create: createCheckoutContract,
	confirm: confirmCheckoutContract,
	registerInvoice: registerInvoiceContract,
	paymentReceived: paymentReceivedContract,
	list: listCheckoutsContract,
	listPaginated: listCheckoutsPaginatedContract,
	// Original names preserved
	listSummary: listCheckoutsSummaryPaginatedContract,
	getSummary: getCheckoutDetailContract,
};
