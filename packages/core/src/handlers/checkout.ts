import { z } from 'zod'

import { confirmCheckout, createCheckout, getCheckout } from '../actions'

/**
 * Customer data schema - matches api-contract but without complex transforms
 * to avoid TypeScript type instantiation issues.
 */
const customerInputSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  externalId: z.string().optional(),
}).catchall(z.string())

const createCheckoutSchema = z.object({
  title: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.enum(['USD', 'SAT']).optional(),
  successUrl: z.string().optional(),
  checkoutPath: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  customer: customerInputSchema.optional(),
  requireCustomerData: z.array(z.string()).optional(),
})

const confirmCheckoutSchema = z.object({
  checkoutId: z.string(),
  customer: customerInputSchema.optional(),
})

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleCreateCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z.object({ params: createCheckoutSchema }).safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid checkout params', details: parsed.error.issues })
  }

  try {
    const checkout = await createCheckout(parsed.data.params)
    return jsonResponse(200, { data: checkout })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to create checkout' })
  }
}

export async function handleGetCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z
    .object({ checkoutId: z.string().min(1) })
    .safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Missing checkoutId' })
  }

  try {
    const checkout = await getCheckout(parsed.data.checkoutId)
    return jsonResponse(200, { data: checkout })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to fetch checkout' })
  }
}

export async function handleConfirmCheckout(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = z
    .object({ confirm: confirmCheckoutSchema })
    .safeParse(body)

  if (!parsed.success) {
    return jsonResponse(400, { error: 'Invalid confirm payload', details: parsed.error.issues })
  }

  try {
    const checkout = await confirmCheckout(parsed.data.confirm)
    return jsonResponse(200, { data: checkout })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to confirm checkout' })
  }
}
