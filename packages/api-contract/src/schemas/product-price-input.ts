import { z } from "zod";
import { CurrencySchema } from "./currency";

/**
 * COPIED from moneydevkit.com/lib/products/schema.ts - ProductPriceFormSchema
 * TODO: When api-contract moves to monorepo, import from shared location instead of copying
 *
 * This schema is used for MCP product create/update operations.
 * It mirrors the dashboard's pricing validation logic.
 */

// Price amount types
export const PriceAmountTypeSchema = z.enum(["FIXED", "CUSTOM"]);
export type PriceAmountType = z.infer<typeof PriceAmountTypeSchema>;

/**
 * Recurring interval schema for product INPUT (MCP create/update).
 * Uses "NEVER" explicitly for one-time purchases.
 * Server normalizes "NEVER" → null when storing/returning.
 */
export const RecurringIntervalInputSchema = z.enum([
	"NEVER",
	"MONTH",
	"QUARTER",
	"YEAR",
]);
export type RecurringIntervalInput = z.infer<
	typeof RecurringIntervalInputSchema
>;

/**
 * Simplified pricing schema: one price per product.
 * Validation rules vary by amountType:
 * - FIXED: priceAmount required and positive
 * - CUSTOM: minimumAmount and presetAmount optional (both non-negative if provided)
 */
export const ProductPriceInputSchema = z
	.object({
		recurringInterval: RecurringIntervalInputSchema,
		currency: CurrencySchema,
		amountType: PriceAmountTypeSchema,
		// Required for FIXED, ignored for CUSTOM
		priceAmount: z
			.number()
			.positive({ message: "Price must be greater than 0" })
			.optional(),
		// Optional for CUSTOM: minimum amount customer can pay
		minimumAmount: z
			.number()
			.nonnegative({ message: "Minimum amount cannot be negative" })
			.optional(),
		// Optional for CUSTOM: suggested/default amount
		presetAmount: z
			.number()
			.nonnegative({ message: "Preset amount cannot be negative" })
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.amountType === "FIXED") {
			if (
				data.priceAmount === undefined ||
				data.priceAmount === null ||
				Number.isNaN(data.priceAmount)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Price must be set for fixed price products",
					path: ["priceAmount"],
				});
			}
		}
		// For CUSTOM: if both minimumAmount and presetAmount are set, preset should be >= minimum
		if (
			data.amountType === "CUSTOM" &&
			data.minimumAmount !== undefined &&
			data.presetAmount !== undefined
		) {
			if (data.presetAmount < data.minimumAmount) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Preset amount must be at least the minimum amount",
					path: ["presetAmount"],
				});
			}
		}
	});

export type ProductPriceInput = z.infer<typeof ProductPriceInputSchema>;
