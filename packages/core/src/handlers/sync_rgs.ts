import { createMoneyDevKitNode } from "../mdk";
import { log } from "../logging";

export async function handleSyncRgs(_request: Request): Promise<Response> {
  try {
    const node = createMoneyDevKitNode();
    const timestamp = node.syncRgs(true);

    log(`Full RGS sync completed, new timestamp: ${timestamp}`);

    return new Response(JSON.stringify({ success: true, timestamp }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
