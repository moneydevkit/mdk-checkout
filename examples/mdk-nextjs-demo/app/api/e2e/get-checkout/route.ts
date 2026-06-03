import { getCheckout } from '@moneydevkit/core';
import { NextRequest, NextResponse } from 'next/server';

function isEnabled() {
  return process.env.MDK_DEMO_E2E_ENABLED === 'true';
}

function notFound() {
  return new Response(null, { status: 404 });
}

export async function GET(request: NextRequest) {
  if (!isEnabled()) return notFound();

  const checkoutId = request.nextUrl.searchParams.get('id') ?? request.nextUrl.searchParams.get('checkoutId');
  if (!checkoutId) {
    return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 });
  }

  try {
    const checkout = await getCheckout(checkoutId);
    return NextResponse.json({ checkout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch checkout';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
