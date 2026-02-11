import { GetCustomerInputSchema } from '@moneydevkit/api-contract'
import { getCustomer } from '../actions'

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleGetCustomer(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = GetCustomerInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, {
      error: parsed.error.errors[0]?.message || 'Invalid input',
    })
  }

  try {
    const customer = await getCustomer(parsed.data)
    return jsonResponse(200, { data: customer })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch customer'
    // Check for "not found" in message (case-insensitive) or specific error codes
    const isNotFound =
      message.toLowerCase().includes('not found') ||
      (error as { code?: string })?.code === 'CUSTOMER_NOT_FOUND' ||
      (error as { status?: number })?.status === 404
    return jsonResponse(isNotFound ? 404 : 500, {
      error: message,
      code: isNotFound ? 'CUSTOMER_NOT_FOUND' : 'INTERNAL_ERROR',
    })
  }
}
