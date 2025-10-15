import { z } from "zod";

import { getMoneyDevKit } from "./mdk";
import { markPaymentReceived } from "./payment-state";

const webhookSchema = z.object({
  event: z.enum(["incoming-payment"]),
  nodeId: z.string(),
});

async function handleIncomingPayment() {
  try {
    const mdk = getMoneyDevKit();
    const payments = mdk.receivePayments();

    if (payments.length === 0) {
      return;
    }

    payments.forEach((payment) => {
      markPaymentReceived(payment.paymentHash);
    });

    try {
      await mdk.checkouts.paymentReceived({
        payments: payments.map((payment) => ({
          paymentHash: payment.paymentHash,
          amountSats: payment.amount,
        })),
      });
    } catch (error) {
      console.warn('[MDK Webhook] Failed to notify MoneyDevKit checkout about received payments. Will rely on local state and retry on next webhook.', error);
    }
  } catch (error) {
    console.error('[MDK Webhook] Failed to handle incoming payment webhook:', error);
    // Don't rethrow - we don't want to fail the webhook if there are temporary connection issues
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
