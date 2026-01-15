import { listProducts } from '../actions'

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleListProducts(_request: Request): Promise<Response> {
  try {
    const products = await listProducts()
    return jsonResponse(200, { data: { products } })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { error: 'Failed to list products' })
  }
}
