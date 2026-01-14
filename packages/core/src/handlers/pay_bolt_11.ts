import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";
import { getPayoutAddressForType } from "../payout-address";

export async function handlePayBolt11(_request: Request): Promise<Response> {
    try {
        const node = createMoneyDevKitNode();
        const bolt11Invoice = getPayoutAddressForType('bolt11');

        log("Initiating Bolt 11 payment flow");

        if (!bolt11Invoice) {
            return new Response("Bolt 11 invoice not configured", { status: 500 });
        }

        await node.payBolt11(bolt11Invoice);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
