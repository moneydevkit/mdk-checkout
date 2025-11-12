import { createMoneyDevKitNode } from "../mdk";

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload ?? null), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleBalance(_request: Request): Promise<Response> {
  try {
    const node = createMoneyDevKitNode();
    const balance = await node.getBalance();
    return jsonResponse(200, balance);
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { error: "Internal Server Error" });
  }
}
