import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  createCheckoutUrl,
  verifyCheckoutSignature,
  parseCheckoutQueryParams,
  sanitizeCheckoutPath,
} from '../src/handlers/checkout'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.MDK_ACCESS_TOKEN = 'test-secret-token-for-testing'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

// ============================================================================
// createCheckoutUrl Tests
// ============================================================================

describe('createCheckoutUrl', () => {
  it('includes action=createCheckout param', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    assert.ok(url.includes('action=createCheckout'))
  })

  it('includes signature param', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    assert.ok(url.includes('signature='))
  })

  it('sorts params alphabetically before signature', () => {
    const url = createCheckoutUrl({ title: 'Z', description: 'A', amount: 100 })
    const paramsBeforeSig = url.split('signature=')[0]
    // action comes before amount, amount before description, description before title
    assert.ok(paramsBeforeSig.indexOf('action=') < paramsBeforeSig.indexOf('amount='))
    assert.ok(paramsBeforeSig.indexOf('amount=') < paramsBeforeSig.indexOf('description='))
    assert.ok(paramsBeforeSig.indexOf('description=') < paramsBeforeSig.indexOf('title='))
  })

  it('JSON-encodes metadata object', () => {
    const url = createCheckoutUrl({
      title: 'Test',
      description: 'Desc',
      amount: 100,
      metadata: { orderId: '123' },
    })
    // URL-encoded JSON
    assert.ok(url.includes('metadata='))
    const parsed = new URL(url, 'http://localhost')
    const metadata = parsed.searchParams.get('metadata')
    assert.deepEqual(JSON.parse(metadata!), { orderId: '123' })
  })

  it('JSON-encodes customer object', () => {
    const url = createCheckoutUrl({
      title: 'Test',
      description: 'Desc',
      amount: 100,
      customer: { email: 'test@example.com' },
    })
    assert.ok(url.includes('customer='))
    const parsed = new URL(url, 'http://localhost')
    const customer = parsed.searchParams.get('customer')
    assert.deepEqual(JSON.parse(customer!), { email: 'test@example.com' })
  })

  it('JSON-encodes requireCustomerData array', () => {
    const url = createCheckoutUrl({
      title: 'Test',
      description: 'Desc',
      amount: 100,
      requireCustomerData: ['name', 'email'],
    })
    assert.ok(url.includes('requireCustomerData='))
    const parsed = new URL(url, 'http://localhost')
    const requireCustomerData = parsed.searchParams.get('requireCustomerData')
    assert.deepEqual(JSON.parse(requireCustomerData!), ['name', 'email'])
  })

  it('omits undefined params', () => {
    const url = createCheckoutUrl({
      title: 'Test',
      description: 'Desc',
      amount: 100,
      successUrl: undefined,
    })
    assert.ok(!url.includes('successUrl'))
  })

  it('uses default basePath /api/mdk', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    assert.ok(url.startsWith('/api/mdk?'))
  })

  it('respects custom basePath option', () => {
    const url = createCheckoutUrl(
      { title: 'Test', description: 'Desc', amount: 100 },
      { basePath: '/custom/path' }
    )
    assert.ok(url.startsWith('/custom/path?'))
  })

  it('throws when MDK_ACCESS_TOKEN is missing', () => {
    delete process.env.MDK_ACCESS_TOKEN
    assert.throws(
      () => createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 }),
      /MDK_ACCESS_TOKEN is required/
    )
  })

  it('produces different signatures for different params', () => {
    const url1 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const url2 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 200 })
    const sig1 = new URL(url1, 'http://localhost').searchParams.get('signature')
    const sig2 = new URL(url2, 'http://localhost').searchParams.get('signature')
    assert.notEqual(sig1, sig2)
  })

  it('produces same signature for same params', () => {
    const url1 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const url2 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const sig1 = new URL(url1, 'http://localhost').searchParams.get('signature')
    const sig2 = new URL(url2, 'http://localhost').searchParams.get('signature')
    assert.equal(sig1, sig2)
  })

  it('includes all provided params', () => {
    const url = createCheckoutUrl({
      title: 'Test Product',
      description: 'A test product',
      amount: 2999,
      currency: 'USD',
      successUrl: '/thank-you',
      checkoutPath: '/pay',
    })
    const parsed = new URL(url, 'http://localhost')
    assert.equal(parsed.searchParams.get('title'), 'Test Product')
    assert.equal(parsed.searchParams.get('description'), 'A test product')
    assert.equal(parsed.searchParams.get('amount'), '2999')
    assert.equal(parsed.searchParams.get('currency'), 'USD')
    assert.equal(parsed.searchParams.get('successUrl'), '/thank-you')
    assert.equal(parsed.searchParams.get('checkoutPath'), '/pay')
  })

  it('handles special characters in title and description', () => {
    const url = createCheckoutUrl({
      title: 'Test & Product <script>',
      description: 'Description with "quotes" and \'apostrophes\'',
      amount: 100,
    })
    const parsed = new URL(url, 'http://localhost')
    assert.equal(parsed.searchParams.get('title'), 'Test & Product <script>')
    assert.equal(parsed.searchParams.get('description'), 'Description with "quotes" and \'apostrophes\'')
  })

  it('handles unicode characters', () => {
    const url = createCheckoutUrl({
      title: '商品名称 🎉',
      description: 'Описание товара',
      amount: 100,
    })
    const parsed = new URL(url, 'http://localhost')
    assert.equal(parsed.searchParams.get('title'), '商品名称 🎉')
    assert.equal(parsed.searchParams.get('description'), 'Описание товара')
  })
})

// ============================================================================
// verifyCheckoutSignature Tests
// ============================================================================

describe('verifyCheckoutSignature', () => {
  it('returns true for valid signature', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    assert.equal(verifyCheckoutSignature(params, signature), true)
  })

  it('returns false for tampered amount', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    params.set('amount', '1') // Tamper
    assert.equal(verifyCheckoutSignature(params, signature), false)
  })

  it('returns false for tampered title', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    params.set('title', 'Hacked')
    assert.equal(verifyCheckoutSignature(params, signature), false)
  })

  it('returns false for added param', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    params.set('extra', 'malicious')
    assert.equal(verifyCheckoutSignature(params, signature), false)
  })

  it('returns false for removed param', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    params.delete('title')
    assert.equal(verifyCheckoutSignature(params, signature), false)
  })

  it('returns false for wrong signature format', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    assert.equal(verifyCheckoutSignature(params, 'not-hex-string'), false)
  })

  it('returns false for empty signature', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    assert.equal(verifyCheckoutSignature(params, ''), false)
  })

  it('returns false when MDK_ACCESS_TOKEN is missing', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    delete process.env.MDK_ACCESS_TOKEN
    assert.equal(verifyCheckoutSignature(params, signature), false)
  })

  it('returns false for truncated signature', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    const truncated = signature.slice(0, 10)
    assert.equal(verifyCheckoutSignature(params, truncated), false)
  })

  it('accepts signature with different case (hex is case-insensitive)', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    const upperCase = signature.toUpperCase()
    // Hex encoding is case-insensitive, so uppercase should also work
    assert.equal(verifyCheckoutSignature(params, upperCase), true)
  })

  it('does not throw for malformed signature (handles gracefully)', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    // Should return false, not throw
    assert.doesNotThrow(() => verifyCheckoutSignature(params, 'xyz'))
    assert.equal(verifyCheckoutSignature(params, 'xyz'), false)
  })

  it('validates complex params with metadata', () => {
    const url = createCheckoutUrl({
      title: 'Test',
      description: 'Desc',
      amount: 100,
      metadata: { orderId: '123', items: ['a', 'b'] },
    })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!
    assert.equal(verifyCheckoutSignature(params, signature), true)
  })
})

// ============================================================================
// parseCheckoutQueryParams Tests
// ============================================================================

describe('parseCheckoutQueryParams', () => {
  it('parses basic string params', () => {
    const params = new URLSearchParams('title=Test&description=Desc')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.title, 'Test')
    assert.equal(result.description, 'Desc')
  })

  it('parses amount as number', () => {
    const params = new URLSearchParams('amount=2999')
    const result = parseCheckoutQueryParams(params)
    assert.strictEqual(result.amount, 2999)
    assert.strictEqual(typeof result.amount, 'number')
  })

  it('parses metadata as JSON object', () => {
    const params = new URLSearchParams('metadata={"orderId":"123"}')
    const result = parseCheckoutQueryParams(params)
    assert.deepEqual(result.metadata, { orderId: '123' })
  })

  it('parses customer as JSON object', () => {
    const params = new URLSearchParams('customer={"email":"test@example.com"}')
    const result = parseCheckoutQueryParams(params)
    assert.deepEqual(result.customer, { email: 'test@example.com' })
  })

  it('parses requireCustomerData as JSON array', () => {
    const params = new URLSearchParams('requireCustomerData=["name","email"]')
    const result = parseCheckoutQueryParams(params)
    assert.deepEqual(result.requireCustomerData, ['name', 'email'])
  })

  it('parses products as JSON array', () => {
    const params = new URLSearchParams('products=["prod_1","prod_2"]')
    const result = parseCheckoutQueryParams(params)
    assert.deepEqual(result.products, ['prod_1', 'prod_2'])
  })

  it('skips action param', () => {
    const params = new URLSearchParams('action=createCheckout&title=Test')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.action, undefined)
    assert.equal(result.title, 'Test')
  })

  it('skips signature param', () => {
    const params = new URLSearchParams('signature=abc123&title=Test')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.signature, undefined)
    assert.equal(result.title, 'Test')
  })

  it('handles invalid JSON in metadata gracefully', () => {
    const params = new URLSearchParams('metadata={invalid')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.metadata, '{invalid') // Falls back to string
  })

  it('handles URL-encoded values', () => {
    const params = new URLSearchParams('title=Hello%20World&description=Test%26More')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.title, 'Hello World')
    assert.equal(result.description, 'Test&More')
  })

  it('handles all params together', () => {
    const params = new URLSearchParams(
      'action=createCheckout&title=Test&description=Desc&amount=100&currency=USD&signature=abc'
    )
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.title, 'Test')
    assert.equal(result.description, 'Desc')
    assert.strictEqual(result.amount, 100)
    assert.equal(result.currency, 'USD')
    assert.equal(result.action, undefined)
    assert.equal(result.signature, undefined)
  })

  it('handles nested metadata objects', () => {
    const metadata = { orderId: '123', customer: { name: 'John' }, items: [1, 2, 3] }
    const params = new URLSearchParams(`metadata=${JSON.stringify(metadata)}`)
    const result = parseCheckoutQueryParams(params)
    assert.deepEqual(result.metadata, metadata)
  })

  it('parses decimal amount correctly', () => {
    const params = new URLSearchParams('amount=99.99')
    const result = parseCheckoutQueryParams(params)
    assert.strictEqual(result.amount, 99.99)
  })

  it('parses zero amount', () => {
    const params = new URLSearchParams('amount=0')
    const result = parseCheckoutQueryParams(params)
    assert.strictEqual(result.amount, 0)
  })

  it('handles empty string values', () => {
    const params = new URLSearchParams('title=&description=Test')
    const result = parseCheckoutQueryParams(params)
    assert.equal(result.title, '')
    assert.equal(result.description, 'Test')
  })
})

// ============================================================================
// Integration: createCheckoutUrl + verifyCheckoutSignature
// ============================================================================

describe('createCheckoutUrl + verifyCheckoutSignature integration', () => {
  it('full round-trip: create URL and verify signature', () => {
    const originalParams = {
      title: 'Test Product',
      description: 'A great product',
      amount: 4999,
      currency: 'USD' as const,
      successUrl: '/success',
      metadata: { orderId: 'ORD-123', sku: 'SKU-456' },
      customer: { email: 'customer@example.com' },
      requireCustomerData: ['name', 'email'],
    }

    const url = createCheckoutUrl(originalParams)
    const parsedUrl = new URL(url, 'http://localhost')
    const signature = parsedUrl.searchParams.get('signature')!

    // Verify the signature is valid
    assert.equal(verifyCheckoutSignature(parsedUrl.searchParams, signature), true)

    // Parse the params back
    const parsedParams = parseCheckoutQueryParams(parsedUrl.searchParams)
    assert.equal(parsedParams.title, originalParams.title)
    assert.equal(parsedParams.description, originalParams.description)
    assert.strictEqual(parsedParams.amount, originalParams.amount)
    assert.equal(parsedParams.currency, originalParams.currency)
    assert.equal(parsedParams.successUrl, originalParams.successUrl)
    assert.deepEqual(parsedParams.metadata, originalParams.metadata)
    assert.deepEqual(parsedParams.customer, originalParams.customer)
    assert.deepEqual(parsedParams.requireCustomerData, originalParams.requireCustomerData)
  })

  it('different tokens produce different signatures', () => {
    process.env.MDK_ACCESS_TOKEN = 'token-1'
    const url1 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const sig1 = new URL(url1, 'http://localhost').searchParams.get('signature')!

    process.env.MDK_ACCESS_TOKEN = 'token-2'
    const url2 = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const sig2 = new URL(url2, 'http://localhost').searchParams.get('signature')!

    assert.notEqual(sig1, sig2)

    // Verify each signature only works with its own token
    const params1 = new URL(url1, 'http://localhost').searchParams
    const params2 = new URL(url2, 'http://localhost').searchParams

    process.env.MDK_ACCESS_TOKEN = 'token-1'
    assert.equal(verifyCheckoutSignature(params1, sig1), true)
    assert.equal(verifyCheckoutSignature(params2, sig2), false)

    process.env.MDK_ACCESS_TOKEN = 'token-2'
    assert.equal(verifyCheckoutSignature(params1, sig1), false)
    assert.equal(verifyCheckoutSignature(params2, sig2), true)
  })

  it('replay: same URL can be used multiple times (signature stays valid)', () => {
    const url = createCheckoutUrl({ title: 'Test', description: 'Desc', amount: 100 })
    const params = new URL(url, 'http://localhost').searchParams
    const signature = params.get('signature')!

    // Signature should remain valid on subsequent verifications
    assert.equal(verifyCheckoutSignature(params, signature), true)
    assert.equal(verifyCheckoutSignature(params, signature), true)
    assert.equal(verifyCheckoutSignature(params, signature), true)
  })
})

// ============================================================================
// sanitizeCheckoutPath Tests (Open Redirect Prevention)
// ============================================================================

describe('sanitizeCheckoutPath', () => {
  it('returns default /checkout for null input', () => {
    assert.equal(sanitizeCheckoutPath(null), '/checkout')
  })

  it('returns default /checkout for empty string', () => {
    assert.equal(sanitizeCheckoutPath(''), '/checkout')
  })

  it('accepts valid relative path /checkout', () => {
    assert.equal(sanitizeCheckoutPath('/checkout'), '/checkout')
  })

  it('accepts valid relative path /pay', () => {
    assert.equal(sanitizeCheckoutPath('/pay'), '/pay')
  })

  it('accepts nested path /app/checkout', () => {
    assert.equal(sanitizeCheckoutPath('/app/checkout'), '/app/checkout')
  })

  it('accepts deeply nested path /api/v1/checkout', () => {
    assert.equal(sanitizeCheckoutPath('/api/v1/checkout'), '/api/v1/checkout')
  })

  // Open redirect attack vectors
  it('rejects absolute URL https://evil.com', () => {
    assert.equal(sanitizeCheckoutPath('https://evil.com'), '/checkout')
  })

  it('rejects absolute URL http://evil.com', () => {
    assert.equal(sanitizeCheckoutPath('http://evil.com'), '/checkout')
  })

  it('rejects protocol-relative URL //evil.com', () => {
    assert.equal(sanitizeCheckoutPath('//evil.com'), '/checkout')
  })

  it('rejects path without leading slash checkout', () => {
    assert.equal(sanitizeCheckoutPath('checkout'), '/checkout')
  })

  it('rejects path without leading slash evil.com/checkout', () => {
    assert.equal(sanitizeCheckoutPath('evil.com/checkout'), '/checkout')
  })

  it('rejects embedded protocol https://evil.com/path', () => {
    assert.equal(sanitizeCheckoutPath('https://evil.com/path'), '/checkout')
  })

  it('rejects path with embedded double slash /checkout//attack', () => {
    assert.equal(sanitizeCheckoutPath('/checkout//attack'), '/checkout')
  })

  it('rejects path with protocol in middle /checkout?redirect=https://evil.com', () => {
    // This contains :// so should be rejected
    assert.equal(sanitizeCheckoutPath('/checkout?redirect=https://evil.com'), '/checkout')
  })

  it('accepts path with single colon /checkout:special', () => {
    // Single colon without // is acceptable
    assert.equal(sanitizeCheckoutPath('/checkout:special'), '/checkout:special')
  })

  it('strips query params to prevent broken URL construction', () => {
    // Query params would break URL construction: /checkout?foo=bar + /abc -> /checkout?foo=bar/abc
    assert.equal(sanitizeCheckoutPath('/checkout?foo=bar'), '/checkout')
  })

  it('rejects javascript: protocol', () => {
    assert.equal(sanitizeCheckoutPath('javascript:alert(1)'), '/checkout')
  })

  it('rejects data: protocol', () => {
    assert.equal(sanitizeCheckoutPath('data:text/html'), '/checkout')
  })

  // Edge cases
  it('accepts path with dots /checkout/../something', () => {
    // Path traversal is handled by the browser/server, sanitizeCheckoutPath just prevents open redirect
    assert.equal(sanitizeCheckoutPath('/checkout/../something'), '/checkout/../something')
  })

  it('accepts root path /', () => {
    assert.equal(sanitizeCheckoutPath('/'), '/')
  })

  it('strips hash to prevent broken URL construction', () => {
    // Hash would break URL construction: /checkout#section + /abc -> /checkout#section/abc
    assert.equal(sanitizeCheckoutPath('/checkout#section'), '/checkout')
  })

  it('strips both query and hash', () => {
    assert.equal(sanitizeCheckoutPath('/checkout?foo=bar#section'), '/checkout')
  })

  it('ensures URL construction with ID works correctly', () => {
    // This test documents the reason for stripping query/hash:
    // When we build URLs like `${checkoutPath}/${id}`, query/hash would corrupt the path
    const sanitized = sanitizeCheckoutPath('/checkout?foo=bar')
    const url = new URL(`${sanitized}/abc123`, 'https://example.com')
    // The ID should be in the pathname, not in the query string
    assert.equal(url.pathname, '/checkout/abc123')
    assert.equal(url.search, '')
  })
})
