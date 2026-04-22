import { z } from "zod";
import {
  SubscriptionSchema,
  SubscriptionWebhookEventSchema,
} from "@moneydevkit/api-contract";

import { log, warn, error as logError } from "../logging";
import { connectControl, type WsClient } from "../control/ws-client";
import { CmdQueue, EventQueue, type SessionState } from "../control/queue";
import { createMoneyDevKitClient, createMoneyDevKitNode, resolveMoneyDevKitOptions } from "../mdk";
import type { MoneyDevKitClient } from "../mdk-client";
import type { MoneyDevKitNode } from "../lightning-node";
import { markPaymentReceived } from "../payment-state";
import { type PaymentEvent, PaymentEventType } from "@moneydevkit/lightning-js";

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

// Polling cadence for nextEvent() and the command queue.
const POLL_INTERVAL_MS = 100;
// Hardcoded Vercel default function lifetime with fluid compute (300s = 5min).
// The plan deliberately does not derive this from process.env to keep behavior
// predictable across deploys; revisit when serverless platforms diverge.
const MAX_LIFETIME_MS = 300_000;
// Window before deadline in which we refuse new RPC commands so in-flight ones
// can settle before the function is killed.
const DRAIN_WINDOW_MS = 15_000;
// Quiet-grace: after this much time with no events AND no commands AND no
// pending in-flight pays/claims, we initiate a graceful shutdown.
const QUIET_GRACE_MS = 60_000;

/**
 * Derive the control WS URL from the configured baseUrl unless overridden via
 * MDK_CONTROL_URL. baseUrl is HTTPS in prod, HTTP in dev; we mirror.
 *
 * IMPORTANT: baseUrl carries the oRPC mount path (`/rpc`), e.g.
 * `https://staging.moneydevkit.com/rpc`. The control server is mounted at the
 * host root under `/control`. We parse the URL and REPLACE the path rather
 * than appending, otherwise we'd produce `wss://.../rpc/control` which the
 * ALB routes to the oRPC target group and returns HTTP 502 at upgrade time.
 */
export function resolveControlUrl(): string {
  if (process.env.MDK_CONTROL_URL) return process.env.MDK_CONTROL_URL;
  const resolved = resolveMoneyDevKitOptions();
  const base = resolved.baseUrl ?? "https://moneydevkit.com";
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/control";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * Build the onReceived helper that preserves the EXISTING webhook behavior:
 *   1. markPaymentReceived(paymentHash) updates in-process state used by
 *      hasPaymentBeenReceived() and other SDK code paths.
 *   2. client.checkouts.paymentReceived(...) notifies mdk.com so the checkout
 *      page completes. Failures are swallowed with a warn; the existing TODO
 *      about reconciliation still applies.
 *
 * Keeping this verbatim is important: dropping either side regresses checkout
 * completion. Do NOT replace with "just push WS event".
 */
function createReceivedHandler(client: MoneyDevKitClient) {
  return async (ev: PaymentEvent): Promise<void> => {
    log(`[webhook] PaymentReceived hash=${ev.paymentHash} amount=${ev.amountMsat}msat`);
    markPaymentReceived(ev.paymentHash);
    try {
      await client.checkouts.paymentReceived({
        payments: [
          {
            paymentHash: ev.paymentHash,
            amountSats: Math.floor((ev.amountMsat ?? 0) / 1000),
            sandbox: false,
          },
        ],
      });
      log(`[webhook] Payment confirmed to API hash=${ev.paymentHash}`);
    } catch (err) {
      // TODO (austin): Investigate retry strategy for API failures. Currently
      // we log and continue (matching existing behavior). However, this leaves
      // us in a state where the payment is received but not confirmed to the
      // paying customer or reflected on moneydevkit.com. Consider having the
      // checkout update based on the global payment state and some sort of
      // reconciliation process to backfill the database.
      warn(`[webhook] Failed to confirm payment ${ev.paymentHash} to API`, err);
    }
  };
}

/**
 * Unified event loop: SOLE caller into the running node's NAPI methods. Drains
 * one event per tick, then one command from the queue, then performs drain
 * and quiet-shutdown checks. RPC handlers in src/control/handlers.ts only push
 * to the queue; they NEVER touch the node directly.
 *
 * Runs until any of:
 *   - WS dropped (client.closed true)
 *   - Hard 300s lifetime reached
 *   - Quiet shutdown: 60s with no events, no in-flight outbound pays, no
 *     pending claims, empty command queue. We push leaseReleased and gracefully
 *     close so mdk.com sees the close and deletes the lease row.
 */
async function unifiedLoop(
  node: MoneyDevKitNode,
  queue: CmdQueue,
  eventQueue: EventQueue,
  wsClient: WsClient,
  sessionState: SessionState,
  client: MoneyDevKitClient,
): Promise<void> {
  const sessionStart = Date.now();
  const deadline = sessionStart + MAX_LIFETIME_MS - DRAIN_WINDOW_MS;
  const pendingClaims = new Set<string>();
  // Outbound payment IDs awaiting Sent or Failed events. The node MUST NOT be
  // destroyed while any are in flight; otherwise the user loses confirmation
  // of whether the payment landed (LDK can usually resume on next start, but
  // the in-session caller has no way to learn the outcome).
  const pendingOutbound = new Set<string>();
  const onReceived = createReceivedHandler(client);
  let drainSoft = false;
  let lastActivity = sessionStart;
  let eventsProcessed = 0;
  let paymentsReceived = 0;
  let paymentsFailed = 0;
  let paymentsSent = 0;
  let commandsRun = 0;

  while (true) {
    // 1. Drain ONE LDK event (priority). nextEvent → ackEvent ordering must be
    //    respected per lightning-js/index.d.ts:94. Single caller (this loop)
    //    guarantees that.
    const ev = node.nextEvent();
    if (ev) {
      lastActivity = Date.now();
      eventsProcessed++;
      switch (ev.eventType) {
        case PaymentEventType.Claimable:
          log(
            `[webhook] PaymentClaimable hash=${ev.paymentHash} amount=${ev.amountMsat}msat pending=${pendingClaims.size + 1}`,
          );
          pendingClaims.add(ev.paymentHash);
          break;
        case PaymentEventType.Received:
          paymentsReceived++;
          pendingClaims.delete(ev.paymentHash);
          await onReceived(ev);
          break;
        case PaymentEventType.Sent: {
          paymentsSent++;
          // paymentId is only present for outbound (per lightning-js/index.d.ts:47).
          if (ev.paymentId) {
            pendingOutbound.delete(ev.paymentId);
            eventQueue.push({
              type: "paymentSent",
              paymentId: ev.paymentId,
              paymentHash: ev.paymentHash,
              preimage: ev.preimage ?? "",
            });
          }
          log(`[webhook] PaymentSent id=${ev.paymentId} hash=${ev.paymentHash}`);
          break;
        }
        case PaymentEventType.Failed: {
          paymentsFailed++;
          // ALWAYS clear pendingClaims here. Failed fires for both inbound
          // (claimable that didn't claim) AND outbound. Matches existing
          // webhook behavior at webhooks.ts:124 and agent-wallet/server.ts:229.
          pendingClaims.delete(ev.paymentHash);
          if (ev.paymentId) {
            pendingOutbound.delete(ev.paymentId);
            eventQueue.push({
              type: "paymentFailed",
              paymentId: ev.paymentId,
              paymentHash: ev.paymentHash,
              ...(ev.reason ? { reason: ev.reason } : {}),
            });
          }
          log(`[webhook] PaymentFailed id=${ev.paymentId} hash=${ev.paymentHash} reason=${ev.reason}`);
          break;
        }
      }
      node.ackEvent();
      continue;
    }

    // 2. Drain ONE command from the queue. All NAPI calls happen here.
    const cmd = queue.shift();
    if (cmd) {
      lastActivity = Date.now();
      commandsRun++;
      try {
        if (cmd.kind === "payout") {
          const r = node.payNow(cmd.destination, cmd.amountMsat);
          pendingOutbound.add(r.paymentId);
          cmd.resolve({
            accepted: true,
            paymentId: r.paymentId,
            paymentHash: r.paymentHash ?? null,
          });
        } else if (cmd.kind === "createBolt11") {
          cmd.resolve(node.createInvoiceNow(cmd.amountMsat, cmd.description, cmd.expirySecs));
        } else if (cmd.kind === "createBolt12Offer") {
          cmd.resolve({
            offer: node.createBolt12OfferNow(cmd.amountMsat, cmd.description, cmd.expirySecs),
          });
        }
      } catch (e) {
        cmd.reject(e instanceof Error ? e : new Error(String(e)));
      }
      continue;
    }

    // 3. Drain checks
    const now = Date.now();
    if (!drainSoft && now >= deadline) {
      drainSoft = true;
      wsClient.startDraining();
      eventQueue.push({ type: "draining" });
      log(`[webhook] entering drain window`);
    }

    // Safe quiet shutdown: ALL of these must be true before we destroy the node.
    // pendingOutbound is the crucial bit the existing webhook handler doesn't
    // track: a fire-and-forget pay's outcome arrives later, and we'd lose it.
    const safeQuiet =
      now - lastActivity >= QUIET_GRACE_MS &&
      pendingClaims.size === 0 &&
      pendingOutbound.size === 0 &&
      queue.size === 0;
    if (safeQuiet) {
      log(`[webhook] quiet shutdown after ${now - sessionStart}ms`);
      eventQueue.push({ type: "leaseReleased" });
      await wsClient.close();
      break;
    }

    if (now >= sessionStart + MAX_LIFETIME_MS) {
      warn(`[webhook] hard 300s timeout reached; pending claims=${pendingClaims.size} outbound=${pendingOutbound.size}`);
      break;
    }

    if (wsClient.closed) {
      log(`[webhook] WS closed externally; exiting loop`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  log(
    `[webhook] loop done events=${eventsProcessed} received=${paymentsReceived} sent=${paymentsSent} failed=${paymentsFailed} commandsRun=${commandsRun}`,
  );
}

/**
 * Handle an incoming-payment webhook by:
 *   1. Dialing WS to mdk.com
 *   2. Awaiting lease.granted (closes the dual-node race; node not constructed
 *      until lease confirmed)
 *   3. RPC handler is attached atomically inside connectControl() so mdk.com
 *      cannot race with no-handler-on-socket
 *   4. Construct + start node + setupBolt12Receive INSIDE the try/finally so a
 *      constructor failure releases the lease via wsClient.close()
 *   5. Run the unified loop
 *   6. finally: node.destroy() + wsClient.close() (both idempotent)
 */
async function handleIncomingPaymentViaControl(): Promise<Response> {
  const start = Date.now();
  log("[webhook] handleIncomingPayment via control plane");

  const queue = new CmdQueue();
  const eventQueue = new EventQueue();
  const sessionState: SessionState = { nodeReady: false, draining: false };

  let wsResult;
  try {
    wsResult = await connectControl({
      url: resolveControlUrl(),
      accessToken: process.env.MDK_ACCESS_TOKEN ?? "",
      queue,
      eventQueue,
      sessionState,
      env: { WITHDRAWAL_DESTINATION: process.env.WITHDRAWAL_DESTINATION },
    });
  } catch (err) {
    logError("[webhook] connectControl failed", err);
    return new Response("OK", { status: 200 });
  }

  if (wsResult.status === "lease-denied") {
    // The server-side code uses WS close frame 4001 for "lease held by another
    // session" and 4003 for "invalid api key". Anything else (e.g. HTTP 502
    // from a misrouted upgrade) is a transport / infra failure, not a lease
    // collision. The prior log lied regardless of cause.
    let suffix: string;
    if (wsResult.code === 4001) suffix = "another session active";
    else if (wsResult.code === 4003) suffix = "invalid api key";
    else suffix = "control endpoint unreachable";
    log(
      `[webhook] lease denied code=${wsResult.code} reason=${wsResult.reason}; ${suffix}`,
    );
    return new Response("OK", { status: 200 });
  }

  const { client: wsClient } = wsResult;
  const mdkClient = createMoneyDevKitClient();
  let node: MoneyDevKitNode | null = null;
  try {
    node = createMoneyDevKitNode();
    node.startReceiving();
    node.setupBolt12Receive();
    sessionState.nodeReady = true;
    eventQueue.push({ type: "ready", nodeId: node.id });
    log(`[webhook] node ready id=${node.id}; entering loop`);
    await unifiedLoop(node, queue, eventQueue, wsClient, sessionState, mdkClient);
  } catch (err) {
    logError("[webhook] handler error", err);
  } finally {
    if (node) {
      try {
        node.destroy();
      } catch (e) {
        warn("[webhook] destroy() failed", e);
      }
    }
    // Idempotent. Releases lease at mdk.com. Always runs (including when
    // createMoneyDevKitNode threw before we entered the loop).
    try {
      await wsClient.close();
    } catch (e) {
      warn("[webhook] wsClient.close() failed", e);
    }
  }

  const totalDuration = Date.now() - start;
  log(`[webhook] complete duration=${totalDuration}ms`);
  return new Response("OK", { status: 200 });
}

export async function handleMdkWebhook(request: Request): Promise<Response> {
  const requestStart = Date.now();
  log("[webhook] received");

  try {
    const body = await request.json();
    const parsed = webhookSchema.parse(body);

    if (parsed.event === "incoming-payment") {
      log(`[webhook] incoming-payment nodeId=${parsed.nodeId}`);
      return await handleIncomingPaymentViaControl();
    }

    // Subscription events: SDK acknowledges but doesn't touch the node.
    // Behavior preserved verbatim from the previous handler.
    log(
      `[webhook] subscription event=${parsed.event} subscriptionId=${parsed.subscription.id}`,
    );
    const duration = Date.now() - requestStart;
    log(`[webhook] response OK in ${duration}ms`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    const duration = Date.now() - requestStart;
    warn(`[webhook] error after ${duration}ms`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
