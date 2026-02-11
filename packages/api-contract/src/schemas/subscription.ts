import { z } from "zod";
import { CurrencySchema } from "./currency";

export const SubscriptionStatusSchema = z.enum([
	"active",
	"past_due",
	"canceled",
]);

export const RecurringIntervalSchema = z.enum(["MONTH", "QUARTER", "YEAR"]);

export const SubscriptionSchema = z.object({
	id: z.string(),
	customerId: z.string(),
	customerEmail: z.string().nullable(),
	productId: z.string(),
	amount: z.number(),
	currency: CurrencySchema,
	recurringInterval: RecurringIntervalSchema,
	status: SubscriptionStatusSchema,
	currentPeriodStart: z.string().datetime(),
	currentPeriodEnd: z.string().datetime(),
	cancelAtPeriodEnd: z.boolean().optional(),
	endsAt: z.string().datetime().optional(),
	endedAt: z.string().datetime().optional(),
	canceledAt: z.string().datetime().optional(),
	startedAt: z.string().datetime(),
});

export const SubscriptionWebhookEventSchema = z.enum([
	"subscription.created",
	"subscription.renewed",
	"subscription.canceled",
	"subscription.payment_failed",
]);

export const SubscriptionWebhookPayloadSchema = z.object({
	handler: z.literal("webhooks"),
	event: SubscriptionWebhookEventSchema,
	subscription: SubscriptionSchema,
});

export type Subscription = z.infer<typeof SubscriptionSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type RecurringInterval = z.infer<typeof RecurringIntervalSchema>;
export type SubscriptionWebhookEvent = z.infer<
	typeof SubscriptionWebhookEventSchema
>;
export type SubscriptionWebhookPayload = z.infer<
	typeof SubscriptionWebhookPayloadSchema
>;
