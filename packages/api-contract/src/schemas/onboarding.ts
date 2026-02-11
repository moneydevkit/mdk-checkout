import { z } from "zod";

export const StartDeviceAuthInputSchema = z.object({
	clientDisplayName: z.string().optional(),
	webhookUrl: z.string().url().optional(),
	forceNewWebhook: z.boolean().optional(),
});

export const StartDeviceAuthOutputSchema = z.object({
	deviceCode: z.string(),
	userCode: z.string(),
	verificationUri: z.string().url(),
	expiresIn: z.number().int().positive(),
	interval: z.number().int().positive(),
});

export const PollDeviceAuthInputSchema = z.object({
	deviceCode: z.string(),
});

export const PollDeviceAuthOutputSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("pending"),
		expiresIn: z.number().int().nonnegative(),
	}),
	z.object({
		status: z.literal("authorized"),
		bootstrapToken: z.string(),
		expiresIn: z.number().int().nonnegative().optional(),
	}),
	z.object({
		status: z.literal("expired"),
	}),
	z.object({
		status: z.literal("denied"),
	}),
]);

export const BootstrapInputSchema = z.object({
	bootstrapToken: z.string(),
	webhookUrl: z.string().url().optional(),
	projectName: z.string().optional(),
	forceNewWebhook: z.boolean().optional(),
});

export const BootstrapOutputSchema = z.object({
	apiKey: z.string(),
	apiKeyPreview: z.string(),
	apiKeyId: z.string(),
	webhookId: z.string(),
	webhookSecret: z.string(),
	organizationId: z.string(),
	webhookUrl: z.string().url(),
});
