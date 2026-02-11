import { z } from "zod";
import { SubscriptionSchema } from "./subscription";

/**
 * Customer schema for API responses.
 * Represents a customer in the organization (admin view).
 * Note: Uses modifiedAt to match Prisma schema naming.
 */
export const CustomerSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	emailVerified: z.boolean(),
	externalId: z.string().nullable(),
	userMetadata: z.record(z.string(), z.any()).nullable(),
	organizationId: z.string(),
	createdAt: z.date(),
	modifiedAt: z.date().nullable(),
});

/**
 * Customer data with their full subscriptions.
 * Returned by the SDK customer.get endpoint.
 */
export const CustomerWithSubscriptionsSchema = z.object({
	id: z.string(),
	email: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
	externalId: z.string().nullable().optional(),
	subscriptions: z.array(SubscriptionSchema),
});

/**
 * Input for getting a customer via SDK.
 * Requires exactly one of: externalId, email, or customerId.
 */
export const GetCustomerInputSchema = z
	.object({
		externalId: z.string().optional(),
		email: z.string().optional(),
		customerId: z.string().optional(),
	})
	.refine(
		(data) => {
			const fields = [data.externalId, data.email, data.customerId].filter(
				Boolean,
			);
			return fields.length === 1;
		},
		{
			message:
				"Exactly one of externalId, email, or customerId must be provided",
		},
	);

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerWithSubscriptions = z.infer<
	typeof CustomerWithSubscriptionsSchema
>;
export type GetCustomerInput = z.infer<typeof GetCustomerInputSchema>;
