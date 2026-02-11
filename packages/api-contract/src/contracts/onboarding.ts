import { oc } from "@orpc/contract";
import type { z } from "zod";
import {
	BootstrapInputSchema,
	BootstrapOutputSchema,
	PollDeviceAuthInputSchema,
	PollDeviceAuthOutputSchema,
	StartDeviceAuthInputSchema,
	StartDeviceAuthOutputSchema,
} from "../schemas/onboarding";

export type StartDeviceAuth = z.infer<typeof StartDeviceAuthInputSchema>;
export type StartDeviceAuthResponse = z.infer<
	typeof StartDeviceAuthOutputSchema
>;
export type PollDeviceAuth = z.infer<typeof PollDeviceAuthInputSchema>;
export type PollDeviceAuthResponse = z.infer<typeof PollDeviceAuthOutputSchema>;
export type BootstrapOnboarding = z.infer<typeof BootstrapInputSchema>;
export type BootstrapOnboardingResponse = z.infer<typeof BootstrapOutputSchema>;

export const startDeviceAuthContract = oc
	.input(StartDeviceAuthInputSchema)
	.output(StartDeviceAuthOutputSchema);

export const pollDeviceAuthContract = oc
	.input(PollDeviceAuthInputSchema)
	.output(PollDeviceAuthOutputSchema);

export const bootstrapContract = oc
	.input(BootstrapInputSchema)
	.output(BootstrapOutputSchema);

export const onboarding = {
	startDeviceAuth: startDeviceAuthContract,
	pollDeviceAuth: pollDeviceAuthContract,
	bootstrap: bootstrapContract,
};
