export { MoneyDevKitClient } from './mdk-client'
export type { MoneyDevKitClientOptions } from './mdk-client'

export { MoneyDevKitNode } from './lightning-node'
import type { MoneyDevKitNodeOptions } from './lightning-node'
export type { MoneyDevKitNodeOptions }

export interface MoneyDevKitOptions {
  accessToken: string
  mnemonic: string
  baseUrl?: string
  nodeOptions?: MoneyDevKitNodeOptions['nodeOptions']
}
