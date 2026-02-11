import { z } from "zod";

/**
 * Common ID input for get/delete operations.
 */
export const IdInputSchema = z.object({
	id: z.string(),
});

export type IdInput = z.infer<typeof IdInputSchema>;

/**
 * Pagination input schema for list operations.
 * Uses cursor-based pagination for efficient large dataset traversal.
 */
export const PaginationInputSchema = z.object({
	limit: z.number().int().min(1).max(100).default(50),
	cursor: z.string().optional(),
});

export type PaginationInput = z.infer<typeof PaginationInputSchema>;

/**
 * Pagination input with descriptions (for AI tools).
 * Use .extend() to add entity-specific filters.
 */
export const PaginatedInputSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(50)
		.describe("Maximum number of items to return (1-100, default 50)"),
	cursor: z
		.string()
		.optional()
		.describe("Cursor for pagination (from previous response)"),
});

export type PaginatedInput = z.infer<typeof PaginatedInputSchema>;

/**
 * Pagination output schema for list operations.
 * Returns a cursor for the next page, or null if no more results.
 */
export const PaginationOutputSchema = z.object({
	nextCursor: z.string().nullable(),
});

export type PaginationOutput = z.infer<typeof PaginationOutputSchema>;
