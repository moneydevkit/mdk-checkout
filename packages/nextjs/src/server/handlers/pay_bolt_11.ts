import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";

export async function handlePayBolt11(_request: Request): Promise<Response> {
    try {
        const node = createMoneyDevKitNode();
        const bolt11Invoice = process.env.WITHDRAWAL_BOLT_11;

        log("Initiating Bolt 11 payment flow");

        if (!bolt11Invoice) {
            return new Response("Bolt 11 invoice not configured", { status: 500 });
        }

        node.payBolt11(bolt11Invoice);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
