import { oc } from "@orpc/contract";
import { z } from "zod";
import { SubscriptionSchema } from "../schemas/subscription";

export const CreateRenewalCheckoutInputSchema = z.object({
	subscriptionId: z.string(),
});

export const CreateRenewalCheckoutOutputSchema = z.object({
	checkoutId: z.string(),
});

export const CancelSubscriptionInputSchema = z.object({
	subscriptionId: z.string(),
});

export const CancelSubscriptionOutputSchema = z.object({
	ok: z.boolean(),
});

export const GetSubscriptionInputSchema = z.object({
	subscriptionId: z.string(),
});

export type CreateRenewalCheckout = z.infer<
	typeof CreateRenewalCheckoutInputSchema
>;
export type CancelSubscriptionInput = z.infer<
	typeof CancelSubscriptionInputSchema
>;
export type GetSubscriptionInput = z.infer<typeof GetSubscriptionInputSchema>;

export const createRenewalCheckoutContract = oc
	.input(CreateRenewalCheckoutInputSchema)
	.output(CreateRenewalCheckoutOutputSchema);

export const cancelSubscriptionContract = oc
	.input(CancelSubscriptionInputSchema)
	.output(CancelSubscriptionOutputSchema);

export const getSubscriptionContract = oc
	.input(GetSubscriptionInputSchema)
	.output(SubscriptionSchema);

export const subscription = {
	createRenewalCheckout: createRenewalCheckoutContract,
	cancel: cancelSubscriptionContract,
	get: getSubscriptionContract,
};
