import { z } from "zod";

import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";
import { getPayoutAddressForType, getPayoutConfig } from "../payout-address";

const lnurlSchema = z.object({
  amount: z.number().positive(),
});

export async function handlePayLNUrl(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = lnurlSchema.parse(body);

    const node = createMoneyDevKitNode();

    // LNURL handler supports LNURL, Lightning Address, and BIP-353 formats
    const config = getPayoutConfig();
    let lnurl: string | null = null;

    if (config.address) {
      const { type, address } = config.address;
      if (type === 'lnurl' || type === 'lightning_address' || type === 'bip353') {
        lnurl = address;
      }
    }

    // Fall back to type-specific lookup for legacy compatibility
    if (!lnurl) {
      lnurl = getPayoutAddressForType('lnurl');
    }

    log("Initiating LNURL payment flow");

    if (!lnurl) {
      return new Response("LNURL not configured", { status: 500 });
    }

    await node.payLNUrl(lnurl, parsed.amount);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
