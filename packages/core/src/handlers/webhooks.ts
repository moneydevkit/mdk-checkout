import { z } from "zod";

import { log, warn } from "../logging";
import { createMoneyDevKitClient, createMoneyDevKitNode } from "../mdk";
import { markPaymentReceived } from "../payment-state";

const webhookSchema = z.object({
  event: z.enum(["incoming-payment"]),
  nodeId: z.string(),
});

const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 100;
const QUIET_THRESHOLD_MS = 4000;
// Minimum time before allowing quiet exit - gives time for in-flight HTLC
// commitment exchanges to complete (UpdateAddHTLC → CommitmentSigned dance)
const MIN_WAIT_BEFORE_QUIET_MS = 6000;

async function handleIncomingPayment() {
  const webhookStartTime = Date.now();
  log("[webhook] handleIncomingPayment started");

  const node = createMoneyDevKitNode();
  const client = createMoneyDevKitClient();

  // Start node and sync
  log("[webhook] Starting node and syncing...");
  const syncStartTime = Date.now();
  node.startReceiving();
  const syncDuration = Date.now() - syncStartTime;
  log(`[webhook] Node started and synced in ${syncDuration}ms`);

  // JavaScript tracks all state
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
          case "claimable":
            log(
              `[webhook] PaymentClaimable hash=${event.paymentHash.slice(0, 16)}... amount=${event.amountMsat}msat pending=${pendingClaims.size + 1}`,
            );
            pendingClaims.add(event.paymentHash);
            // Safe to ACK - we've recorded it in our Set
            node.ackEvent();
            break;

          case "received":
            paymentsReceived++;
            log(
              `[webhook] PaymentReceived hash=${event.paymentHash.slice(0, 16)}... amount=${event.amountMsat}msat confirming...`,
            );
            pendingClaims.delete(event.paymentHash);

            // CONFIRM IMMEDIATELY - don't wait!
            markPaymentReceived(event.paymentHash);
            try {
              const apiStartTime = Date.now();
              await client.checkouts.paymentReceived({
                payments: [
                  {
                    paymentHash: event.paymentHash,
                    amountSats: event.amountMsat! / 1000,
                    sandbox: false,
                  },
                ],
              });
              const apiDuration = Date.now() - apiStartTime;
              log(
                `[webhook] Payment confirmed to API in ${apiDuration}ms hash=${event.paymentHash.slice(0, 16)}...`,
              );
              // Only ACK after successful API confirmation
              node.ackEvent();
            } catch (error) {
              warn(
                `[webhook] Failed to confirm payment to API hash=${event.paymentHash.slice(0, 16)}... NOT ACKing (will retry)`,
                error,
              );
              // Don't ACK - the event will be replayed on next startup
              // But we need to break out of the loop to avoid infinite retry
              // The local state (markPaymentReceived) will prevent duplicate UI updates
            }
            break;

          case "failed":
            paymentsFailed++;
            log(
              `[webhook] PaymentFailed hash=${event.paymentHash.slice(0, 16)}... reason=${event.reason}`,
            );
            pendingClaims.delete(event.paymentHash);
            // Safe to ACK - we've recorded the failure
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

      // Exit when safe to shutdown:
      // - Hard timeout, OR
      // - No pending claims AND quiet threshold reached
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

      // Only allow quiet exit after minimum wait time
      // This prevents shutting down while HTLC commitment exchanges are in-flight
      // (LDK doesn't emit events during the commitment dance, only after)
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
    log(`[webhook] Parsed event=${parsed.event} nodeId=${parsed.nodeId}`);

    if (parsed.event === "incoming-payment") {
      await handleIncomingPayment();
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
