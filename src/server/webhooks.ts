import { z } from "zod";

import { getMoneyDevKit } from "./mdk";
import { markPaymentReceived } from "./payment-state";
import { validateWebhookSignature, WebhookSignatureError } from "./webhook-signatures";

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
    console.warn('Failed to notify MoneyDevKit checkout about received payments. Will rely on local state and retry on next webhook.', error);
  }
}

export async function handleMdkWebhook(request: Request): Promise<Response> {
  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.MDK_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('MDK_WEBHOOK_SECRET is not configured');
      return new Response("Webhook secret not configured", { status: 500 });
    }

    // Get the signature header
    const signatureHeader = request.headers.get('X-MDK-Signature');
    
    // Read the body as text for signature validation
    const bodyText = await request.text();
    
    // Validate the webhook signature
    try {
      validateWebhookSignature(webhookSecret, signatureHeader, bodyText);
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        console.error('Webhook signature validation failed:', error.message);
        return new Response("Invalid signature", { status: 401 });
      }
      throw error;
    }

    // Parse the validated body
    const body = JSON.parse(bodyText);
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
