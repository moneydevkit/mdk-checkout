/**
 * Server-only enforcement for @moneydevkit/payouts
 *
 * This module ensures the package cannot be used from browser context.
 */

import { BrowserNotAllowedError } from './errors'

/**
 * Checks if running in browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Throws if called from browser context.
 * Call this at the top of server-only functions.
 */
export function assertServerOnly(): void {
  if (isBrowser()) {
    throw new BrowserNotAllowedError()
  }
}

/**
 * Validates that a request does not appear to come from a browser.
 * Rejects requests with browser-specific headers.
 *
 * @param request - The incoming request to validate
 * @param allowedOrigins - Optional list of allowed origins (for same-origin requests)
 * @throws BrowserNotAllowedError if request appears to be from a browser
 */
export function assertNotBrowserRequest(
  request: Request,
  allowedOrigins?: string[],
): void {
  const headers = request.headers

  // Check Sec-Fetch-Mode header (browsers set this automatically)
  const secFetchMode = headers.get('sec-fetch-mode')
  if (secFetchMode === 'cors' || secFetchMode === 'navigate') {
    throw new BrowserNotAllowedError()
  }

  // Check Sec-Fetch-Site header
  const secFetchSite = headers.get('sec-fetch-site')
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') {
    throw new BrowserNotAllowedError()
  }

  // Check Origin header for cross-origin requests
  const origin = headers.get('origin')
  if (origin) {
    // If we have allowed origins, check against them
    if (allowedOrigins && allowedOrigins.length > 0) {
      if (!allowedOrigins.includes(origin)) {
        throw new BrowserNotAllowedError()
      }
    } else {
      // No allowed origins configured, reject any request with Origin header
      // (server-to-server requests typically don't include Origin)
      throw new BrowserNotAllowedError()
    }
  }
}
