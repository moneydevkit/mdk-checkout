import { z } from "zod";

import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";

const payoutSchema = z.object({
  amount: z.number().positive().optional(),
});

export async function handlePayout(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = payoutSchema.parse(body);

    const node = createMoneyDevKitNode();
    const destination = process.env.WITHDRAWAL_DESTINATION;

    log("Initiating payout");

    if (!destination) {
      return new Response("WITHDRAWAL_DESTINATION not configured", { status: 500 });
    }

    node.pay(destination, parsed.amount);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
