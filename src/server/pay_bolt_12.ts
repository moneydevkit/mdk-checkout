import { getMoneyDevKit } from "./mdk";

export async function handlePayBolt12(request: Request): Promise<Response> {
  try {
    const mdk = getMoneyDevKit();
    let bolt12Offer = process.env.WITHDRAWAL_BOLT_12;
    console.log("Paying Bolt 12 offer:", bolt12Offer);
    if (!bolt12Offer) {
        return new Response("Bolt 12 offer not configured", { status: 500 });
    }
    mdk.payBolt12Offer(bolt12Offer);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  return handlePayBolt12(request);
}
