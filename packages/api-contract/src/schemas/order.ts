import { z } from "zod";
import { CurrencySchema } from "./currency";

/**
 * Order status enum matching Prisma OrderStatus.
 * Note: Prisma uses String type, so we validate against known values.
 */
export const OrderStatusSchema = z.enum([
	"PENDING",
	"PAID",
	"REFUNDED",
	"CANCELLED",
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * Order item schema representing a line item in an order.
 * Note: Uses modifiedAt to match Prisma schema naming.
 */
export const OrderItemSchema = z.object({
	id: z.string(),
	orderId: z.string(),
	productPriceId: z.string().nullable(),
	label: z.string(),
	amount: z.number(),
	createdAt: z.date(),
	modifiedAt: z.date().nullable(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Order schema for MCP API responses.
 * Note: Uses modifiedAt to match Prisma schema naming.
 * Note: Order doesn't have totalAmount directly - it's calculated from subtotalAmount + taxAmount.
 */
export const OrderSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	customerId: z.string().nullable(),
	status: OrderStatusSchema,
	currency: CurrencySchema,
	subtotalAmount: z.number(),
	taxAmount: z.number(),
	userMetadata: z.record(z.string(), z.any()).nullable(),
	createdAt: z.date(),
	modifiedAt: z.date().nullable(),
});

export type Order = z.infer<typeof OrderSchema>;

// Import CustomerSchema for relations (lazy to avoid circular deps)
import { CustomerSchema } from "./customer";

/**
 * Order with related customer and items for detailed views.
 */
export const OrderWithRelationsSchema = OrderSchema.extend({
	customer: CustomerSchema.nullable(),
	orderItems: z.array(OrderItemSchema),
});

export type OrderWithRelations = z.infer<typeof OrderWithRelationsSchema>;
