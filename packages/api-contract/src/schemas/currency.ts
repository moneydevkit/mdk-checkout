import { z } from "zod";

/**
 * Supported currencies for pricing and payments.
 * - USD: US Dollars (amounts in cents)
 * - SAT: Satoshis (amounts in whole sats)
 */
export const CurrencySchema = z.enum(["USD", "SAT"]);
export type Currency = z.infer<typeof CurrencySchema>;
