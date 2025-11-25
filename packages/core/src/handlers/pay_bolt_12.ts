import { z } from "zod";

import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";

const bolt12Schema = z.object({
  amount: z.number().positive(),
});

export async function handlePayBolt12(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = bolt12Schema.parse(body);

    const node = createMoneyDevKitNode();
    const bolt12Offer = process.env.WITHDRAWAL_BOLT_12;

    log("Initiating Bolt 12 payment flow");

    if (!bolt12Offer) {
      return new Response("Bolt 12 offer not configured", { status: 500 });
    }

    await node.payBolt12Offer(bolt12Offer, parsed.amount);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
