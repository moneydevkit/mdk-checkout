import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	type OrderWithRelations,
	OrderWithRelationsSchema,
} from "../schemas/order";
import {
	PaginatedInputSchema,
	PaginationOutputSchema,
} from "../schemas/pagination";

// Re-export entity schema for backwards compatibility
export { OrderWithRelationsSchema };
export type { OrderWithRelations };

// List output schemas
export const ListOrdersOutputSchema = z.object({
	orders: z.array(OrderWithRelationsSchema),
});
export type ListOrdersOutput = z.infer<typeof ListOrdersOutputSchema>;

export const ListOrdersPaginatedInputSchema = PaginatedInputSchema.extend({
	customerId: z.string().optional().describe("Filter by customer ID"),
	status: z
		.string()
		.optional()
		.describe("Filter by status: PENDING, PAID, REFUNDED, or CANCELLED"),
});
export type ListOrdersPaginatedInput = z.infer<
	typeof ListOrdersPaginatedInputSchema
>;

export const ListOrdersPaginatedOutputSchema = PaginationOutputSchema.extend({
	orders: z.array(OrderWithRelationsSchema),
});
export type ListOrdersPaginatedOutput = z.infer<
	typeof ListOrdersPaginatedOutputSchema
>;

export const GetOrderInputSchema = z.object({
	id: z.string().describe("The order ID"),
});
export type GetOrderInput = z.infer<typeof GetOrderInputSchema>;

// Contracts
export const listOrdersContract = oc
	.input(z.object({}))
	.output(ListOrdersOutputSchema);

export const listOrdersPaginatedContract = oc
	.input(ListOrdersPaginatedInputSchema)
	.output(ListOrdersPaginatedOutputSchema);

export const getOrderContract = oc
	.input(GetOrderInputSchema)
	.output(OrderWithRelationsSchema);

export const order = {
	list: listOrdersContract,
	listPaginated: listOrdersPaginatedContract,
	get: getOrderContract,
};
