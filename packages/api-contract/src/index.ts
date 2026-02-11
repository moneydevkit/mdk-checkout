import { checkout } from "./contracts/checkout";
import { customer } from "./contracts/customer";
import { onboarding } from "./contracts/onboarding";
import { order } from "./contracts/order";
import { products } from "./contracts/products";
import { subscription } from "./contracts/subscription";

export type {
	CheckoutStatus,
	CheckoutType,
	CheckoutListItem,
	CheckoutDetail,
	ListCheckoutsOutput,
	ListCheckoutsPaginatedInput,
	ListCheckoutsPaginatedOutput,
	ListCheckoutsSummaryOutput,
	GetCheckoutInput,
	ConfirmCheckout,
	CreateCheckout,
	PaymentReceived,
	RegisterInvoice,
} from "./contracts/checkout";
export {
	CheckoutStatusSchema,
	CheckoutTypeSchema,
	CheckoutListItemSchema,
	CheckoutDetailSchema,
	ListCheckoutsOutputSchema,
	ListCheckoutsPaginatedInputSchema,
	ListCheckoutsPaginatedOutputSchema,
	ListCheckoutsSummaryOutputSchema,
	GetCheckoutInputSchema,
} from "./contracts/checkout";
export type {
	BootstrapOnboarding,
	BootstrapOnboardingResponse,
	PollDeviceAuth,
	PollDeviceAuthResponse,
	StartDeviceAuth,
	StartDeviceAuth as StartDeviceAuthInput,
	StartDeviceAuthResponse,
} from "./contracts/onboarding";
export type {
	CancelSubscriptionInput,
	CreateRenewalCheckout,
	GetSubscriptionInput,
} from "./contracts/subscription";
export type { GetCustomerInput as SdkGetCustomerInput } from "./schemas/customer";
export type {
	CreateCustomerInput,
	UpdateCustomerInput,
	ListCustomersOutput,
	ListCustomersPaginatedInput,
	ListCustomersPaginatedOutput,
	GetCustomerInput,
	DeleteCustomerInput,
	CustomerLookupInput,
} from "./contracts/customer";
export {
	CreateCustomerInputSchema,
	UpdateCustomerInputSchema,
	ListCustomersOutputSchema,
	ListCustomersPaginatedInputSchema,
	ListCustomersPaginatedOutputSchema,
	GetCustomerInputSchema,
	DeleteCustomerInputSchema,
	CustomerLookupInputSchema,
	CustomerLookupToolSchema,
} from "./contracts/customer";
export type { Checkout } from "./schemas/checkout";
export { CheckoutSchema } from "./schemas/checkout";
export type { Currency } from "./schemas/currency";
export { CurrencySchema } from "./schemas/currency";
export type {
	Product,
	ProductDetail,
	ProductPrice,
	ListProductsOutput,
	ListProductsDetailOutput,
	ListProductsInput,
	GetProductInput,
	DeleteProductInput,
	CreateProductInput,
	UpdateProductInput,
	CreateProductToolInput,
	UpdateProductToolInput,
} from "./contracts/products";
export {
	ProductSchema,
	ProductDetailSchema,
	ProductPriceSchema,
	ListProductsOutputSchema,
	ListProductsDetailOutputSchema,
	ListProductsInputSchema,
	GetProductInputSchema,
	DeleteProductInputSchema,
	CreateProductInputSchema,
	UpdateProductInputSchema,
	CreateProductToolInputSchema,
	UpdateProductToolInputSchema,
} from "./contracts/products";
export type {
	RecurringInterval,
	Subscription,
	SubscriptionStatus,
	SubscriptionWebhookEvent,
	SubscriptionWebhookPayload,
} from "./schemas/subscription";
export {
	RecurringIntervalSchema,
	SubscriptionSchema,
	SubscriptionStatusSchema,
	SubscriptionWebhookEventSchema,
	SubscriptionWebhookPayloadSchema,
} from "./schemas/subscription";
export type { Customer, CustomerWithSubscriptions } from "./schemas/customer";
export {
	CustomerSchema,
	CustomerWithSubscriptionsSchema,
	GetCustomerInputSchema as SdkGetCustomerInputSchema,
} from "./schemas/customer";

// New MCP schemas
export type { Order, OrderItem, OrderStatus } from "./schemas/order";
export type {
	OrderWithRelations,
	ListOrdersOutput,
	ListOrdersPaginatedInput,
	ListOrdersPaginatedOutput,
	GetOrderInput,
} from "./contracts/order";
export {
	OrderWithRelationsSchema,
	ListOrdersOutputSchema,
	ListOrdersPaginatedInputSchema,
	ListOrdersPaginatedOutputSchema,
	GetOrderInputSchema,
} from "./contracts/order";
export {
	OrderSchema,
	OrderItemSchema,
	OrderStatusSchema,
} from "./schemas/order";
export type {
	IdInput,
	PaginationInput,
	PaginatedInput,
	PaginationOutput,
} from "./schemas/pagination";
export {
	IdInputSchema,
	PaginationInputSchema,
	PaginatedInputSchema,
	PaginationOutputSchema,
} from "./schemas/pagination";
export type {
	PriceAmountType,
	ProductPriceInput,
	RecurringIntervalInput,
} from "./schemas/product-price-input";
export {
	PriceAmountTypeSchema,
	ProductPriceInputSchema,
	RecurringIntervalInputSchema,
} from "./schemas/product-price-input";

// Unified contract - contains all methods from both SDK and MCP
export const contract = {
	checkout,
	customer,
	onboarding,
	order,
	products,
	subscription,
};

// SDK contract - only the methods the SDK router implements
export const sdkContract = {
	checkout: {
		get: checkout.get,
		create: checkout.create,
		confirm: checkout.confirm,
		registerInvoice: checkout.registerInvoice,
		paymentReceived: checkout.paymentReceived,
	},
	onboarding,
	products: {
		list: products.list,
	},
};

// MCP contract - only the methods the MCP router implements
export const mcpContract = {
	customer: {
		list: customer.listPaginated,
		get: customer.get,
		create: customer.create,
		update: customer.update,
		delete: customer.delete,
	},
	order: {
		list: order.listPaginated,
		get: order.get,
	},
	checkout: {
		list: checkout.listSummary,
		get: checkout.getSummary,
	},
	products: {
		list: products.listPaginated,
		get: products.get,
		create: products.create,
		update: products.update,
		delete: products.delete,
	},
};

export type { MetadataValidationError } from "./validation/metadata-validation";
export {
	MAX_KEY_COUNT,
	MAX_KEY_LENGTH,
	MAX_METADATA_SIZE_BYTES,
	validateMetadata,
} from "./validation/metadata-validation";

export type { Result } from "./lib/utils";
export { ok, err } from "./lib/utils";
