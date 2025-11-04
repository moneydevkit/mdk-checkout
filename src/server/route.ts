import { z } from "zod";

import { handleBalance } from "./handlers/balance";
import { handlePayBolt12 } from "./handlers/pay_bolt_12";
import { handlePing } from "./handlers/ping";
import { handleMdkWebhook } from "./handlers/webhooks";
import { log } from "./logging";

type RouteHandler = (request: Request) => Promise<Response>;

const WEBHOOK_SECRET_HEADER = "x-moneydevkit-webhook-secret";

const routeSchema = z.enum(["webhook", "webhooks", "pay_bolt_12", "balance", "ping"]);
export type UnifiedRoute = z.infer<typeof routeSchema>;

const HANDLERS: Partial<Record<UnifiedRoute, RouteHandler>> = {};

function assignDefaultHandlers() {
  HANDLERS.webhook = handleMdkWebhook;
  HANDLERS.webhooks = handleMdkWebhook;
  HANDLERS.pay_bolt_12 = handlePayBolt12;
  HANDLERS.balance = handleBalance;
  HANDLERS.ping = handlePing;
}

assignDefaultHandlers();

const ROUTE_BODY_KEYS = ["handler", "route", "target"] as const;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validateWebhookSecret(request: Request): Response | null {
  const expectedSecret = process.env.MDK_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("MDK_WEBHOOK_SECRET environment variable is not configured.");
    return jsonResponse(500, { error: "Webhook secret is not configured." });
  }

  const providedSecret = request.headers.get(WEBHOOK_SECRET_HEADER);

  if (!providedSecret || providedSecret !== expectedSecret) {
    log("Unauthorized webhook request received.");
    log(`Expected secret: ${expectedSecret}`);
    log(`Provided secret: ${providedSecret}`);
    return jsonResponse(401, { error: "Unauthorized" });
  }

  return null;
}

export function __setHandlerForTest(route: UnifiedRoute, handler: RouteHandler | null) {
  if (handler) {
    HANDLERS[route] = handler;
  } else {
    delete HANDLERS[route];
  }
}

export function __resetHandlersForTest() {
  assignDefaultHandlers();
}

async function resolveRoute(request: Request): Promise<UnifiedRoute | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    for (const key of ROUTE_BODY_KEYS) {
      const value = body?.[key];
      if (typeof value === "string") {
        const parsed = routeSchema.safeParse(value.toLowerCase());
        if (parsed.success) {
          return parsed.data;
        }
      }
    }
  } catch {
    // Ignore JSON parse errors; downstream handlers will try again if needed.
  }

  return null;
}

export async function POST(request: Request) {
  const authError = validateWebhookSecret(request);

  if (authError) {
    return authError;
  }

  const route = await resolveRoute(request);

  if (!route) {
    return jsonResponse(400, {
      error: `Missing or invalid handler. Include a JSON body with a "handler" property set to one of ${routeSchema.options.join(", ")}.`,
    });
  }

  const handler = HANDLERS[route];

  if (!handler) {
    return jsonResponse(501, {
      error: `Handler "${route}" is not implemented in this version of mdk-checkout.`,
    });
  }

  try {
    return await handler(request);
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { error: "Internal Server Error" });
  }
}
