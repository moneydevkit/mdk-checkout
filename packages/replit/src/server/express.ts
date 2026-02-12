import express from 'express'
import type { RequestHandler, Router } from 'express'

import { createUnifiedHandler, GET as getHandler } from '@moneydevkit/core/route'

// Re-export createCheckoutUrl for server-side URL generation
export { createCheckoutUrl } from '@moneydevkit/core/route'
export type { CreateCheckoutUrlOptions } from '@moneydevkit/core/route'

export { withPayment } from '@moneydevkit/core/mdk402'
export type { PaymentConfig } from '@moneydevkit/core/mdk402'

const unifiedHandler = createUnifiedHandler()

function toFetchRequest(req: express.Request): Request {
  const protocol = req.protocol || 'http'
  const host = req.get('host') || 'localhost'
  const url = `${protocol}://${host}${req.originalUrl || req.url || ''}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    } else if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v)
      }
    }
  }

  if (!headers.has('content-type') && req.is('application/json')) {
    headers.set('content-type', 'application/json')
  }

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' && req.body
      ? JSON.stringify(req.body)
      : undefined

  return new Request(url, {
    method: req.method,
    headers,
    body,
  })
}

async function sendFetchResponse(res: express.Response, response: Response) {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  const buffer = Buffer.from(await response.arrayBuffer())
  res.status(response.status).send(buffer)
}

export const mdkExpressHandler: RequestHandler = async (req, res) => {
  try {
    const request = toFetchRequest(req)
    const response = await unifiedHandler(request)
    await sendFetchResponse(res, response)
  } catch (error) {
    console.error('MDK Express handler error', error)
    res.status(500).send('Internal Server Error')
  }
}

export const mdkExpressGetHandler: RequestHandler = async (req, res) => {
  try {
    const request = toFetchRequest(req)
    const response = await getHandler(request)

    // Handle redirects specially for Express
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location) {
        res.redirect(response.status, location)
        return
      }
    }

    await sendFetchResponse(res, response)
  } catch (error) {
    console.error('MDK Express GET handler error', error)
    res.status(500).send('Internal Server Error')
  }
}

export function createMdkExpressRouter(): Router {
  const router = express.Router()
  router.use(express.json())
  router.get('/', mdkExpressGetHandler)
  router.post('/', mdkExpressHandler)
  return router
}

export default createMdkExpressRouter
