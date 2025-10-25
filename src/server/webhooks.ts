import { z } from "zod";

import { getMoneyDevKit } from "./mdk";
import { markPaymentReceived } from "./payment-state";

const webhookSchema = z.object({
  event: z.enum(["incoming-payment"]),
  nodeId: z.string(),
});

async function handleIncomingPayment() {
  const mdk = getMoneyDevKit();
  const payments = mdk.receivePayments();
  const payments2 = mdk.receivePayments();

  console.log('handleIncomingPayment. Received payments:', payments, payments2);

  if (payments.length === 0 && payments2.length === 0) {
    return;
  }

  payments.forEach((payment) => {
    markPaymentReceived(payment.paymentHash);
  });

  payments2.forEach((payment) => {
    markPaymentReceived(payment.paymentHash);
  });

  try {
    await mdk.checkouts.paymentReceived({
      payments: payments.map((payment) => ({
        paymentHash: payment.paymentHash,
        amountSats: payment.amount,
      })),
    });

    await mdk.checkouts.paymentReceived({
      payments: payments2.map((payment) => ({
        paymentHash: payment.paymentHash,
        amountSats: payment.amount,
      })),
    });
  } catch (error) {
    console.warn('Failed to notify MoneyDevKit checkout about received payments. Will rely on local state and retry on next webhook.', error);
  }
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
