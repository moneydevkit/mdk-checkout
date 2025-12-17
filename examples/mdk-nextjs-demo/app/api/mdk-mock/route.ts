import { NextResponse } from "next/server";
import crypto from "node:crypto";

type MockInvoice = {
  invoice: string;
  amountSats: number;
  amountSatsReceived?: number;
  expiresAt: string;
  fiatAmount: number;
  btcPrice: number;
};

type MockCheckout = {
  id: string;
  status: "PENDING_PAYMENT" | "PAYMENT_RECEIVED";
  currency: "USD" | "SAT";
  successUrl?: string;
  userMetadata?: Record<string, unknown>;
  invoiceAmountSats: number;
  invoice?: MockInvoice;
};

type MockState = {
  checkout: MockCheckout | null;
  log: string[];
};

type GlobalForMock = {
  mockState?: MockState;
}

// Persist state across Next.js module reloads in development mode
const globalForMock = globalThis as GlobalForMock;

const mockState: MockState = globalForMock.mockState ?? {
  checkout: null,
  log: [],
};

globalForMock.mockState = mockState;

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function buildMockInvoice(amountSats: number): MockInvoice {
  const fiatAmount = amountSats / 10; // Pretend 10 sats = $1 (only for display)
  return {
    invoice: `lnmock${crypto.randomBytes(16).toString("hex")}`,
    amountSats,
    amountSatsReceived: 0,
    expiresAt: nowPlusMinutes(10),
    fiatAmount,
    btcPrice: 68000,
  };
}

function createMockCheckout(params: {
  amount: number;
  currency?: "USD" | "SAT";
  metadata?: Record<string, unknown>;
  successUrl?: string;
}): MockCheckout {
  const amountSats = params.currency === "SAT" ? params.amount : Math.max(50_000, params.amount * 4);
  return {
    id: `mock-${Date.now()}`,
    status: "PENDING_PAYMENT",
    currency: params.currency ?? "USD",
    successUrl: params.successUrl ?? "/checkout/success",
    invoiceAmountSats: amountSats,
    invoice: buildMockInvoice(amountSats),
    userMetadata: params.metadata,
  };
}

function setCheckout(checkout: MockCheckout) {
  mockState.checkout = checkout;
  mockState.log = ["client.create", "client.confirm", "client.registerInvoice"];
}

function markPaid() {
  if (!mockState.checkout) return;
  mockState.checkout.status = "PAYMENT_RECEIVED";
  if (mockState.checkout.invoice) {
    mockState.checkout.invoice.amountSatsReceived = mockState.checkout.invoice.amountSats;
  }
}

function handlerFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const maybe = (body as any).handler ?? (body as any).route ?? (body as any).target;
  return typeof maybe === "string" ? maybe.toLowerCase() : null;
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    // ignore, some callers (Cypress webhook) might send empty bodies
  }

  const handler = handlerFromBody(body);

  if (handler === "create_checkout") {
    const params = body?.params ?? {};
    const checkout = createMockCheckout({
      amount: Number(params.amount) || 2500,
      currency: params.currency === "SAT" ? "SAT" : "USD",
      metadata: params.metadata ?? params,
      successUrl: params.successUrl,
    });
    setCheckout(checkout);
    return NextResponse.json({ data: checkout });
  }

  if (handler === "get_checkout") {
    const checkoutId: string | undefined = body?.checkoutId;
    if (!mockState.checkout || !checkoutId || mockState.checkout.id !== checkoutId) {
      return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
    }
    mockState.log.push("client.get");
    return NextResponse.json({ data: mockState.checkout });
  }

  if (handler === "confirm_checkout") {
    if (!mockState.checkout) {
      return NextResponse.json({ error: "No checkout to confirm" }, { status: 404 });
    }
    return NextResponse.json({ data: mockState.checkout });
  }

  if (handler === "webhook" || handler === "webhooks") {
    markPaid();
    mockState.log.push("webhook.incoming-payment");
    return NextResponse.json({ ok: true });
  }

  if (handler === "ping") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported handler" }, { status: 400 });
}

export async function GET() {
  if (!mockState.checkout) {
    return NextResponse.json({ status: "NO_CHECKOUT", log: mockState.log });
  }
  return NextResponse.json({
    status: mockState.checkout.status,
    log: mockState.log,
    checkout: mockState.checkout,
  });
}
