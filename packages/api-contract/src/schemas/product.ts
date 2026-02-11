import { z } from "zod";
import { CurrencySchema } from "./currency";
import { RecurringIntervalSchema } from "./subscription";

// Price schema - used in product responses
export const ProductPriceSchema = z.object({
	id: z.string(),
	amountType: z.enum(["FIXED", "CUSTOM"]),
	priceAmount: z.number().nullable(),
	currency: CurrencySchema,
});
export type ProductPrice = z.infer<typeof ProductPriceSchema>;

// Core product fields
export const ProductSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	recurringInterval: RecurringIntervalSchema.nullable(),
	prices: z.array(ProductPriceSchema),
});
export type Product = z.infer<typeof ProductSchema>;

// Extended with administrative metadata
export const ProductDetailSchema = ProductSchema.extend({
	userMetadata: z.record(z.string(), z.unknown()).nullable(),
	organizationId: z.string(),
	createdAt: z.date(),
	modifiedAt: z.date().nullable(),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

// Aliases for checkout context (backwards compat)
export const CheckoutProductPriceSchema = ProductPriceSchema;
export const CheckoutProductSchema = ProductSchema;
