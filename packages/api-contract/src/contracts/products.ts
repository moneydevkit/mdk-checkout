import { oc } from "@orpc/contract";
import { z } from "zod";
import { CurrencySchema } from "../schemas/currency";
import {
	PaginatedInputSchema,
	PaginationOutputSchema,
} from "../schemas/pagination";
import {
	type Product,
	type ProductDetail,
	ProductDetailSchema,
	type ProductPrice,
	ProductPriceSchema,
	ProductSchema,
} from "../schemas/product";
import {
	PriceAmountTypeSchema,
	ProductPriceInputSchema,
	RecurringIntervalInputSchema,
} from "../schemas/product-price-input";

// Re-export entity schemas for backwards compatibility
export { ProductSchema, ProductDetailSchema, ProductPriceSchema };
export type { Product, ProductDetail, ProductPrice };

// List output schemas
export const ListProductsOutputSchema = z.object({
	products: z.array(ProductSchema),
});
export type ListProductsOutput = z.infer<typeof ListProductsOutputSchema>;

export const ListProductsDetailOutputSchema = PaginationOutputSchema.extend({
	products: z.array(ProductDetailSchema),
});
export type ListProductsDetailOutput = z.infer<
	typeof ListProductsDetailOutputSchema
>;

// Simple list without pagination
export const listProductsContract = oc
	.input(z.object({}))
	.output(ListProductsOutputSchema);

// Paginated list with full product details
export const ListProductsInputSchema = PaginatedInputSchema;
export type ListProductsInput = z.infer<typeof ListProductsInputSchema>;

export const listProductsPaginatedContract = oc
	.input(ListProductsInputSchema)
	.output(ListProductsDetailOutputSchema);

// CRUD input schemas
export const CreateProductInputSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	price: ProductPriceInputSchema,
	userMetadata: z.record(z.string(), z.string()).optional(),
});

export const UpdateProductInputSchema = z.object({
	id: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	price: ProductPriceInputSchema.optional(),
	userMetadata: z.record(z.string(), z.string()).optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;

// Flattened tool input schemas (flat params are easier for AI tools)
export const CreateProductToolInputSchema = z.object({
	name: z.string().min(1).describe("Product name"),
	description: z.string().optional().describe("Product description"),
	priceAmount: z
		.number()
		.optional()
		.describe(
			"Price amount (in cents for USD, whole sats for SAT). Required for fixed pricing.",
		),
	currency: CurrencySchema.optional().describe(
		"Currency: USD or SAT (default: USD)",
	),
	amountType: PriceAmountTypeSchema.optional().describe(
		"Amount type: FIXED or CUSTOM (default: FIXED)",
	),
	recurringInterval: RecurringIntervalInputSchema.optional().describe(
		"Recurring interval: NEVER (one-time), MONTH, QUARTER, or YEAR (default: NEVER)",
	),
});

export const UpdateProductToolInputSchema = z.object({
	id: z.string().describe("The product ID to update"),
	name: z.string().optional().describe("New product name"),
	description: z.string().optional().describe("New product description"),
	priceAmount: z
		.number()
		.optional()
		.describe("New price amount (in cents for USD, whole sats for SAT)"),
	currency: CurrencySchema.optional().describe("Currency: USD or SAT"),
	amountType: PriceAmountTypeSchema.optional().describe(
		"Amount type: FIXED or CUSTOM",
	),
	recurringInterval: RecurringIntervalInputSchema.optional().describe(
		"Recurring interval: NEVER, MONTH, QUARTER, or YEAR",
	),
});

export type CreateProductToolInput = z.infer<
	typeof CreateProductToolInputSchema
>;
export type UpdateProductToolInput = z.infer<
	typeof UpdateProductToolInputSchema
>;

export const GetProductInputSchema = z.object({
	id: z.string().describe("The product ID"),
});
export type GetProductInput = z.infer<typeof GetProductInputSchema>;

export const DeleteProductInputSchema = z.object({
	id: z.string().describe("The product ID to delete"),
});
export type DeleteProductInput = z.infer<typeof DeleteProductInputSchema>;

// Contracts
export const getProductContract = oc
	.input(GetProductInputSchema)
	.output(ProductDetailSchema);

export const createProductContract = oc
	.input(CreateProductInputSchema)
	.output(ProductDetailSchema);

export const updateProductContract = oc
	.input(UpdateProductInputSchema)
	.output(ProductDetailSchema);

export const deleteProductContract = oc
	.input(DeleteProductInputSchema)
	.output(z.void());

export const products = {
	list: listProductsContract,
	listPaginated: listProductsPaginatedContract,
	get: getProductContract,
	create: createProductContract,
	update: updateProductContract,
	delete: deleteProductContract,
};
