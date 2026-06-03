import { createCheckout, type CreateCheckoutParams } from '@moneydevkit/core';
import { NextRequest, NextResponse } from 'next/server';

function isEnabled() {
  return process.env.MDK_DEMO_E2E_ENABLED === 'true';
}

function notFound() {
  return new Response(null, { status: 404 });
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) return notFound();

  const body = (await request.json()) as CreateCheckoutParams;
  const result = await createCheckout({
    ...body,
    checkoutPath: body.checkoutPath ?? '/checkout',
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error.status ?? 400 });
  }

  return NextResponse.json({ checkout: result.data.checkout });
}
