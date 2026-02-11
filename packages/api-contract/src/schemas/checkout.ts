import { z } from "zod";
import { CurrencySchema } from "./currency";
import { CustomerSchema } from "./customer";
import {
	BaseInvoiceSchema,
	DynamicAmountPendingInvoiceSchema,
	FixedAmountPendingInvoiceSchema,
	PaidInvoiceSchema,
} from "./invoice";
import { CheckoutProductSchema } from "./product";

/**
 * Valid fields that can be required at checkout time.
 * 'email', 'name', and 'externalId' are standard fields, anything else is a custom field.
 */
const CustomerFieldSchema = z.string().min(1);

/**
 * Customer data in checkout response.
 * Flat structure - standard fields (name, email, externalId) plus custom string fields.
 * Uses nullish() to accept both null and undefined from the database.
 */
const CustomerOutputSchema = z
	.object({
		name: z.string().nullish(),
		email: z.string().email().nullish(),
		externalId: z.string().nullish(),
	})
	.catchall(z.string());

const BaseCheckoutSchema = z.object({
	id: z.string(),
	createdAt: z.date(),
	clientSecret: z.string(),
	type: z.enum(["PRODUCTS", "AMOUNT", "TOP_UP"]),
	status: z.enum([
		"UNCONFIRMED",
		"CONFIRMED",
		"PENDING_PAYMENT",
		"PAYMENT_RECEIVED",
		"EXPIRED",
	]),
	organizationId: z.string(),
	expiresAt: z.date(),
	userMetadata: z.record(z.any()).nullable(),
	customFieldData: z.record(z.any()).nullable(),
	currency: CurrencySchema,
	allowDiscountCodes: z.boolean(),
	/**
	 * Array of customer fields required at checkout.
	 * @example ['email'] - email required
	 * @example ['email', 'name'] - both required
	 */
	requireCustomerData: z.array(CustomerFieldSchema).nullable(),
	successUrl: z.string().nullable(),
	/**
	 * Customer data associated with this checkout.
	 */
	customer: CustomerOutputSchema.nullable(),
	customerBillingAddress: z.record(z.any()).nullable(),
	products: z.array(CheckoutProductSchema).nullable(),
	/**
	 * The selected product ID (from the products array).
	 * For PRODUCTS checkouts, this is the product the customer has chosen.
	 * null for AMOUNT/TOP_UP checkouts.
	 */
	productId: z.string().nullable(),
	/**
	 * The selected product price ID.
	 * References a price from the selected product's prices array.
	 * null for AMOUNT/TOP_UP checkouts.
	 */
	productPriceId: z.string().nullable(),
	/**
	 * User-provided amount for CUSTOM price products.
	 * Only set when the selected price has amountType: CUSTOM.
	 */
	customAmount: z.number().nullable(),
	/**
	 * The selected product with full details (convenience field).
	 * Same shape as items in the products array.
	 * null if no product is selected.
	 */
	product: CheckoutProductSchema.nullable(),
	providedAmount: z.number().nullable(),
	totalAmount: z.number().nullable(),
	discountAmount: z.number().nullable(),
	netAmount: z.number().nullable(),
	taxAmount: z.number().nullable(),
	invoiceAmountSats: z.number().nullable(),
	invoiceScid: z.string().nullable(),
	btcPrice: z.number().nullable(),
	invoice: BaseInvoiceSchema.nullable(),
});

const AmountFieldsSchema = z.object({
	totalAmount: z.number(),
	discountAmount: z.number(),
	netAmount: z.number(),
	taxAmount: z.number(),
	invoiceAmountSats: z.number(),
	btcPrice: z.number(),
});

export const ExpiredCheckoutSchema = BaseCheckoutSchema.extend({
	status: z.literal("EXPIRED"),
	type: z.enum(["PRODUCTS", "AMOUNT", "TOP_UP"]),
});

export const UnconfirmedCheckoutSchema = z.discriminatedUnion("type", [
	BaseCheckoutSchema.extend({
		status: z.literal("UNCONFIRMED"),
		type: z.literal("PRODUCTS"),
		products: z.array(CheckoutProductSchema).nonempty(),
	}),
	BaseCheckoutSchema.extend({
		status: z.literal("UNCONFIRMED"),
		type: z.literal("AMOUNT"),
		providedAmount: z.number(),
	}),
	BaseCheckoutSchema.extend({
		status: z.literal("UNCONFIRMED"),
		type: z.literal("TOP_UP"),
	}),
]);

export const ConfirmedCheckoutSchema = z.discriminatedUnion("type", [
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("CONFIRMED"),
		type: z.literal("PRODUCTS"),
		products: z.array(CheckoutProductSchema).nonempty(),
	}),
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("CONFIRMED"),
		type: z.literal("AMOUNT"),
		providedAmount: z.number(),
	}),
	BaseCheckoutSchema.extend({
		status: z.literal("CONFIRMED"),
		type: z.literal("TOP_UP"),
	}),
]);

export const PendingPaymentCheckoutSchema = z.discriminatedUnion("type", [
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("PENDING_PAYMENT"),
		type: z.literal("PRODUCTS"),
		products: z.array(CheckoutProductSchema).nonempty(),
		invoice: FixedAmountPendingInvoiceSchema,
	}),
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("PENDING_PAYMENT"),
		type: z.literal("AMOUNT"),
		providedAmount: z.number(),
		invoice: FixedAmountPendingInvoiceSchema,
	}),
	BaseCheckoutSchema.extend({
		status: z.literal("PENDING_PAYMENT"),
		type: z.literal("TOP_UP"),
		invoice: DynamicAmountPendingInvoiceSchema,
	}),
]);

export const PaymentReceivedCheckoutSchema = z.discriminatedUnion("type", [
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("PAYMENT_RECEIVED"),
		type: z.literal("PRODUCTS"),
		products: z.array(CheckoutProductSchema).nonempty(),
		invoice: PaidInvoiceSchema,
	}),
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("PAYMENT_RECEIVED"),
		type: z.literal("AMOUNT"),
		providedAmount: z.number(),
		invoice: PaidInvoiceSchema,
	}),
	BaseCheckoutSchema.merge(AmountFieldsSchema).extend({
		status: z.literal("PAYMENT_RECEIVED"),
		type: z.literal("TOP_UP"),
		invoice: PaidInvoiceSchema,
	}),
]);

export const CheckoutSchema = z.union([
	UnconfirmedCheckoutSchema,
	ConfirmedCheckoutSchema,
	PendingPaymentCheckoutSchema,
	PaymentReceivedCheckoutSchema,
	ExpiredCheckoutSchema,
]);

export type Checkout = z.infer<typeof CheckoutSchema>;

// Simple enum schemas for filtering/display
export const CheckoutStatusSchema = z.enum([
	"UNCONFIRMED",
	"CONFIRMED",
	"PENDING_PAYMENT",
	"PAYMENT_RECEIVED",
	"EXPIRED",
]);
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

export const CheckoutTypeSchema = z.enum(["PRODUCTS", "AMOUNT", "TOP_UP"]);
export type CheckoutType = z.infer<typeof CheckoutTypeSchema>;

// Summary schema for list views (lighter than full CheckoutSchema)
export const CheckoutListItemSchema = z.object({
	id: z.string(),
	status: CheckoutStatusSchema,
	type: CheckoutTypeSchema,
	currency: CurrencySchema,
	totalAmount: z.number().nullable(),
	customerId: z.string().nullable(),
	customer: CustomerSchema.nullable(),
	productId: z.string().nullable(),
	organizationId: z.string(),
	expiresAt: z.date(),
	createdAt: z.date(),
	modifiedAt: z.date().nullable(),
});
export type CheckoutListItem = z.infer<typeof CheckoutListItemSchema>;

// Detail schema (includes additional fields beyond list item)
export const CheckoutDetailSchema = CheckoutListItemSchema.extend({
	userMetadata: z.record(z.unknown()).nullable(),
	successUrl: z.string().nullable(),
	discountAmount: z.number().nullable(),
	netAmount: z.number().nullable(),
	taxAmount: z.number().nullable(),
});
export type CheckoutDetail = z.infer<typeof CheckoutDetailSchema>;
