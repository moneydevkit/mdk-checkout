import { getMoneyDevKit } from "../mdk";

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload ?? null), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleBalance(_request: Request): Promise<Response> {
  try {
    const mdk = getMoneyDevKit();
    const balance = await mdk.getBalance();
    return jsonResponse(200, balance);
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { error: "Internal Server Error" });
  }
}

