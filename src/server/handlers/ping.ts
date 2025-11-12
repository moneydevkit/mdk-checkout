import { createMoneyDevKitNode } from "../mdk";

export async function handlePing(_request: Request): Promise<Response> {
  try {
    const node = createMoneyDevKitNode();
    await node.syncWallets();
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
