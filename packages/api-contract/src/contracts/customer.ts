import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	CustomerSchema,
	CustomerWithSubscriptionsSchema,
	GetCustomerInputSchema as SdkGetCustomerInputSchema,
} from "../schemas/customer";
import {
	PaginatedInputSchema,
	PaginationOutputSchema,
} from "../schemas/pagination";

// Simple list (no pagination)
export const ListCustomersOutputSchema = z.object({
	customers: z.array(CustomerSchema),
});
export type ListCustomersOutput = z.infer<typeof ListCustomersOutputSchema>;

// Paginated list (no additional filters for customers)
export const ListCustomersPaginatedInputSchema = PaginatedInputSchema;
export type ListCustomersPaginatedInput = z.infer<
	typeof ListCustomersPaginatedInputSchema
>;

export const ListCustomersPaginatedOutputSchema = PaginationOutputSchema.extend(
	{
		customers: z.array(CustomerSchema),
	},
);
export type ListCustomersPaginatedOutput = z.infer<
	typeof ListCustomersPaginatedOutputSchema
>;

// Customer lookup by exactly one identifier (discriminated union for contract validation)
const CustomerLookupByIdSchema = z.object({
	id: z.string().describe("The customer ID"),
});
const CustomerLookupByEmailSchema = z.object({
	email: z.string().describe("The customer email address"),
});
const CustomerLookupByExternalIdSchema = z.object({
	externalId: z.string().describe("The external ID from your system"),
});

export const CustomerLookupInputSchema = z.union([
	CustomerLookupByIdSchema,
	CustomerLookupByEmailSchema,
	CustomerLookupByExternalIdSchema,
]);
export type CustomerLookupInput = z.infer<typeof CustomerLookupInputSchema>;

// Flat schema for MCP tools (xmcp needs .shape, unions don't have it)
export const CustomerLookupToolSchema = z.object({
	id: z.string().optional().describe("The customer ID"),
	email: z.string().optional().describe("The customer email address"),
	externalId: z
		.string()
		.optional()
		.describe("The external ID from your system"),
});

export const GetCustomerInputSchema = CustomerLookupToolSchema;
export type GetCustomerInput = z.infer<typeof GetCustomerInputSchema>;

export const DeleteCustomerInputSchema = CustomerLookupToolSchema;
export type DeleteCustomerInput = z.infer<typeof DeleteCustomerInputSchema>;

export const CreateCustomerInputSchema = z.object({
	name: z.string().min(1).describe("Customer name"),
	email: z.string().email().describe("Customer email address"),
	externalId: z
		.string()
		.optional()
		.describe("External ID from your system for linking"),
});

export const UpdateCustomerInputSchema = z.object({
	id: z.string().describe("The customer ID to update"),
	name: z.string().optional().describe("New customer name"),
	email: z.string().email().optional().describe("New customer email address"),
	externalId: z
		.string()
		.optional()
		.describe("External ID from your system for linking"),
	userMetadata: z
		.record(z.string(), z.string())
		.optional()
		.describe("Custom metadata key-value pairs"),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInputSchema>;

// SDK contract - uses flexible lookup (externalId/email/customerId)
export const getSdkCustomerContract = oc
	.input(SdkGetCustomerInputSchema)
	.output(CustomerWithSubscriptionsSchema);

// Contracts
export const listCustomersContract = oc
	.input(z.object({}))
	.output(ListCustomersOutputSchema);

export const listCustomersPaginatedContract = oc
	.input(ListCustomersPaginatedInputSchema)
	.output(ListCustomersPaginatedOutputSchema);

export const getCustomerContract = oc
	.input(GetCustomerInputSchema)
	.output(CustomerSchema);

export const createCustomerContract = oc
	.input(CreateCustomerInputSchema)
	.output(CustomerSchema);

export const updateCustomerContract = oc
	.input(UpdateCustomerInputSchema)
	.output(CustomerSchema);

export const deleteCustomerContract = oc
	.input(DeleteCustomerInputSchema)
	.output(z.void());

export const customer = {
	list: listCustomersContract,
	listPaginated: listCustomersPaginatedContract,
	get: getCustomerContract,
	getSdk: getSdkCustomerContract,
	create: createCustomerContract,
	update: updateCustomerContract,
	delete: deleteCustomerContract,
};
