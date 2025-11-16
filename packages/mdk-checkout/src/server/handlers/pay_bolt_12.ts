import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";

export async function handlePayBolt12(_request: Request): Promise<Response> {
  try {
    const node = createMoneyDevKitNode();
    const bolt12Offer = process.env.WITHDRAWAL_BOLT_12;

    log("Initiating Bolt 12 payment flow");

    if (!bolt12Offer) {
      return new Response("Bolt 12 offer not configured", { status: 500 });
    }

    node.payBolt12Offer(bolt12Offer);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
