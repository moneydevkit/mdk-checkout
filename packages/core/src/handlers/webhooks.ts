import { z } from "zod";
import {
  SubscriptionSchema,
  SubscriptionWebhookEventSchema,
} from "@moneydevkit/api-contract";

import { log, warn } from "../logging";
import { createMoneyDevKitClient, createMoneyDevKitNode } from "../mdk";
import { markPaymentReceived } from "../payment-state";
import { PaymentEventType } from "@moneydevkit/lightning-js";

// Incoming payment events - have nodeId, no subscription
const incomingPaymentEventSchema = z.object({
  handler: z.literal("webhooks"),
  event: z.literal("incoming-payment"),
  nodeId: z.string(),
});

// Subscription events - have subscription, no nodeId
const subscriptionEventSchema = z.object({
  handler: z.literal("webhooks"),
  event: SubscriptionWebhookEventSchema,
  subscription: SubscriptionSchema,
});

// Discriminated union - TypeScript will narrow based on `event`
const webhookSchema = z.union([
  incomingPaymentEventSchema,
  subscriptionEventSchema,
]);

// How often to poll for new LDK events
const POLL_INTERVAL_MS = 100;
// Minimum time that we'll run the lightning node when handling incoming payments.
// This needs to be long enough for JIT channel opening and HTLC commitment exchanges.
const MIN_WAIT_BEFORE_QUIET_MS = 15_000;
// After the minimum wait, this is how long we'll wait for new events if there are no pending claims.
const QUIET_THRESHOLD_MS = 5_000;
// Maximum time we'll run the lightning node when handling incoming payments.
// Vercel has a hard timeout of 60 seconds for the hobby plan so this should not
// be longer than that.
const MAX_WAIT_MS = 60_000;

/**
 * Handles incoming-payment webhooks from MoneyDevKit platform.
 *
 * This function is invoked when the MDK node sends a webhook notification
 * indicating that new payments have arrived ("incoming-payment" event).
 */
async function handleIncomingPaymentEvents() {
  const webhookStartTime = Date.now();
  log("[webhook] handleIncomingPayment started");

  const node = createMoneyDevKitNode();
  const client = createMoneyDevKitClient();

  log("[webhook] Starting node and syncing...");
  const syncStartTime = Date.now();
  node.startReceiving();
  const syncDuration = Date.now() - syncStartTime;
  log(`[webhook] Node started and synced in ${syncDuration}ms`);

  const pendingClaims = new Set<string>();
  let eventsProcessed = 0;
  let paymentsReceived = 0;
  let paymentsFailed = 0;

  const startTime = Date.now();
  let lastEventTime = startTime;

  try {
    while (true) {
      const event = node.nextEvent();

      if (event) {
        lastEventTime = Date.now();
        eventsProcessed++;

        switch (event.eventType) {
          case PaymentEventType.Claimable:
            log(
              `[webhook] PaymentClaimable hash=${event.paymentHash} amount=${event.amountMsat}msat pending=${pendingClaims.size + 1}`,
            );
            pendingClaims.add(event.paymentHash);
            node.ackEvent();
            break;

          case PaymentEventType.Received: {
            paymentsReceived++;
            log(
              `[webhook] PaymentReceived hash=${event.paymentHash} amount=${event.amountMsat}msat`,
            );
            pendingClaims.delete(event.paymentHash);
            markPaymentReceived(event.paymentHash);

            try {
              await client.checkouts.paymentReceived({
                payments: [{
                  paymentHash: event.paymentHash,
                  amountSats: Math.floor(event.amountMsat! / 1000),
                  sandbox: false,
                }],
              });
              log(`[webhook] Payment confirmed to API hash=${event.paymentHash}`);
            } catch (error) {
              // TODO (austin): Investigate retry strategy for API failures. Currently we ack
              // regardless of API success (matching existing behavior). However,
              // this leaves us in a state where the payment is received but not
              // confirmed to the paying customer or reflected on moneydevkit.com.
              // Consider having the checkout update based on the global payment state
              // and some sort of reconciliation process to backfill the database.
              warn(
                `[webhook] Failed to confirm payment ${event.paymentHash} to API`,
                error,
              );
            }
            node.ackEvent();
            break;
          }

          case PaymentEventType.Failed:
            paymentsFailed++;
            log(
              `[webhook] PaymentFailed hash=${event.paymentHash} reason=${event.reason}`,
            );
            pendingClaims.delete(event.paymentHash);
            node.ackEvent();
            break;
        }

        // Continue immediately to process next event
        continue;
      }

      // No event available - check exit conditions
      const now = Date.now();
      const totalElapsed = now - startTime;
      const quietElapsed = now - lastEventTime;

      if (totalElapsed >= MAX_WAIT_MS) {
        if (pendingClaims.size > 0) {
          warn(
            `[webhook] Hard timeout after ${totalElapsed}ms with ${pendingClaims.size} pending claims`,
          );
        } else {
          log(`[webhook] Hard timeout after ${totalElapsed}ms (no pending)`);
        }
        break;
      }

      const canQuietExit =
        pendingClaims.size === 0 &&
        quietElapsed >= QUIET_THRESHOLD_MS &&
        totalElapsed >= MIN_WAIT_BEFORE_QUIET_MS;

      if (canQuietExit) {
        log(
          `[webhook] Quiet exit after ${totalElapsed}ms (quiet=${quietElapsed}ms)`,
        );
        break;
      }

      // Log occasionally while waiting for minimum time
      if (
        pendingClaims.size === 0 &&
        quietElapsed >= QUIET_THRESHOLD_MS &&
        totalElapsed < MIN_WAIT_BEFORE_QUIET_MS &&
        totalElapsed % 1000 < POLL_INTERVAL_MS
      ) {
        log(
          `[webhook] Waiting for min time: ${totalElapsed}/${MIN_WAIT_BEFORE_QUIET_MS}ms`,
        );
      }

      // Yield to JS event loop
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    log("[webhook] Stopping node...");
    node.stopReceiving();
    const totalDuration = Date.now() - webhookStartTime;
    log(
      `[webhook] Complete: duration=${totalDuration}ms events=${eventsProcessed} received=${paymentsReceived} failed=${paymentsFailed}`,
    );
  }
}

export async function handleMdkWebhook(request: Request): Promise<Response> {
  const requestStartTime = Date.now();
  log("[webhook] Received webhook request");

  try {
    const body = await request.json();
    const parsed = webhookSchema.parse(body);

    if (parsed.event === "incoming-payment") {
      log(`[webhook] Parsed event=${parsed.event} nodeId=${parsed.nodeId}`);
      await handleIncomingPaymentEvents();
    } else {
      // Subscription events - SDK acknowledges but doesn't handle
      // (merchant handles via their own webhook logic)
      log(`[webhook] Parsed event=${parsed.event} subscriptionId=${parsed.subscription.id}`);
    }

    const duration = Date.now() - requestStartTime;
    log(`[webhook] Response OK in ${duration}ms`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    const duration = Date.now() - requestStartTime;
    warn(`[webhook] Error after ${duration}ms:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
