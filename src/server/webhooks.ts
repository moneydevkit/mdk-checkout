import { z } from "zod";

import { getMoneyDevKit } from "./mdk";

const webhookSchema = z.object({
  event: z.enum(["incoming-payment"]),
  nodeId: z.string(),
});

async function handleIncomingPayment() {
  const mdk = getMoneyDevKit();
  const payments = mdk.receivePayments();

  if (payments.length === 0) {
    return;
  }

  await mdk.checkouts.paymentReceived({
    payments: payments.map((payment) => ({
      paymentHash: payment.paymentHash,
      amountSats: payment.amount,
    })),
  });
}

export async function handleMdkWebhook(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = webhookSchema.parse(body);

    if (parsed.event === "incoming-payment") {
      await handleIncomingPayment();
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleMdkWebhook(request);
}
