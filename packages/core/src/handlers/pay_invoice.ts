import { z } from 'zod'

import { markInvoicePaidPreview } from '../actions.js'
import { is_preview_environment } from '../preview.js'

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// RPC adapter for markInvoicePaidPreview. Gated to preview-runtime: outside
// preview, the endpoint returns 403 regardless of payload. The merchant's
// `paymentReceived` RPC is currently merchant-asserted (server trusts the
// client-supplied `sandbox` flag and the claimed paymentHash). Exposing this
// route on a real prod deployment lets any same-origin caller with a CSRF
// token fake-mark a checkout as paid, firing the `checkout.completed`
// webhook and potentially triggering autopayout against real merchant
// balance. The preview gate keeps the dev-only path off the public surface.
export async function handlePreviewPayInvoice(request: Request): Promise<Response> {
  if (!is_preview_environment()) {
    return jsonResponse(403, { error: 'pay_invoice is only available in preview mode' })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z
    .object({
      paymentHash: z.string().min(1),
      amountSats: z.number().positive(),
    })
    .safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid pay invoice payload', details: parsed.error.issues })
  }

  try {
    const result = await markInvoicePaidPreview(parsed.data.paymentHash, parsed.data.amountSats)
    return jsonResponse(200, { data: result })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to mark invoice as paid' })
  }
}
