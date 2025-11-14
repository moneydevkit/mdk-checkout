import { z } from "zod";

import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";

const lnurlSchema = z.object({
  amount: z.number().positive(),
});

export async function handlePayLNUrl(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = lnurlSchema.parse(body);

    const node = createMoneyDevKitNode();
    const lnurl = process.env.WITHDRAWAL_LNURL;

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
