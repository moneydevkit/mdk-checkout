/**
 * Balance checking for @moneydevkit/payouts
 */

import { createMoneyDevKitNode } from '@moneydevkit/core'

import { assertServerOnly } from './server-only'
import { getPayoutConfig } from './config'
import { InternalError } from './errors'
import type { Balance } from './types'

/**
 * Gets the current wallet balance.
 *
 * @returns Balance in various currencies
 *
 * @example
 * ```ts
 * import { getBalance } from '@moneydevkit/payouts'
 *
 * const balance = await getBalance()
 * console.log(`Balance: ${balance.sats} sats (~$${balance.usd.toFixed(2)})`)
 * ```
 */
export async function getBalance(): Promise<Balance> {
  // Server-only enforcement
  assertServerOnly()

  // Validate config
  getPayoutConfig()

  try {
    const node = createMoneyDevKitNode()
    const sats = node.getBalance()

    const btc = sats / 100_000_000

    // TODO: In production, fetch current exchange rates from moneydevkit.com API
    // For now, use placeholder rates
    const btcPriceUsd = 100_000 // Placeholder
    const usdEurRate = 0.92 // Placeholder

    const usd = btc * btcPriceUsd
    const eur = usd * usdEurRate

    return {
      sats,
      btc,
      usd,
      eur,
    }
  } catch (error) {
    throw new InternalError(
      `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Checks if balance is sufficient for a payment
 *
 * @param amountSats - Amount to check in sats
 * @returns true if balance is sufficient
 */
export async function hasEnoughBalance(amountSats: number): Promise<boolean> {
  const balance = await getBalance()
  return balance.sats >= amountSats
}
