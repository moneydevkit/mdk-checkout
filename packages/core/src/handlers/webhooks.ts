import { z } from "zod";

import { warn } from "../logging";
import { createMoneyDevKitClient, createMoneyDevKitNode } from "../mdk";
import { markPaymentReceived } from "../payment-state";

const webhookSchema = z.object({
  event: z.enum(["incoming-payment"]),
  nodeId: z.string(),
});

async function handleIncomingPayment() {
  const node = createMoneyDevKitNode();
  const client = createMoneyDevKitClient();

  // Use callback-based receive to process payments IMMEDIATELY as they arrive
  // This allows instant customer confirmation while node continues running
  node.receivePaymentsWithCallback((payment) => {
    // Mark payment received in local state IMMEDIATELY
    markPaymentReceived(payment.paymentHash);

    // Notify backend asynchronously (fire and forget for speed)
    // Note: payment.amount is in msat, convert to sats
    client.checkouts
      .paymentReceived({
        payments: [
          {
            paymentHash: payment.paymentHash,
            amountSats: payment.amount / 1000,
            sandbox: false,
          },
        ],
      })
      .catch((error) => {
        warn(
          "Failed to notify MoneyDevKit checkout about received payment. Will rely on local state and retry on next webhook.",
          error,
        );
      });
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
