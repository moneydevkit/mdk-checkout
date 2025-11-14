
import { log } from "../logging";
import { createMoneyDevKitNode } from "../mdk";


export async function listChannels(request: Request): Promise<Response> {
    try {
        const body = await request.json();

        const node = createMoneyDevKitNode();

        log("Listing channels");

        return new Response(JSON.stringify(await node.listChannels()), { status: 200 });

    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
