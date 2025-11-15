import { MoneyDevKitNode } from './lightning-node'
import { MoneyDevKitClient } from './mdk-client'
import {
  MAINNET_MDK_BASE_URL,
  MAINNET_MDK_NODE_OPTIONS,
  SIGNET_MDK_BASE_URL,
  SIGNET_MDK_NODE_OPTIONS,
} from './mdk-config'
import type { MoneyDevKitOptions } from './money-dev-kit'

type EnvConfig = {
  accessToken?: string
  mnemonic?: string
  baseUrl?: string
  nodeOptions?: MoneyDevKitOptions['nodeOptions']
}

function readEnv(): EnvConfig {
  const nodeOptions: MoneyDevKitOptions['nodeOptions'] = {}

  if (process.env.MDK_NETWORK) {
    nodeOptions.network = process.env.MDK_NETWORK as any
  }
  if (process.env.MDK_VSS_URL) {
    nodeOptions.vssUrl = process.env.MDK_VSS_URL
  }
  if (process.env.MDK_ESPLORA_URL) {
    nodeOptions.esploraUrl = process.env.MDK_ESPLORA_URL
  }
  if (process.env.MDK_RGS_URL) {
    nodeOptions.rgsUrl = process.env.MDK_RGS_URL
  }
  if (process.env.MDK_LSP_NODE_ID) {
    nodeOptions.lspNodeId = process.env.MDK_LSP_NODE_ID
  }
  if (process.env.MDK_LSP_ADDRESS) {
    nodeOptions.lspAddress = process.env.MDK_LSP_ADDRESS
  }

  return {
    accessToken: process.env.MDK_ACCESS_TOKEN,
    mnemonic: process.env.MDK_MNEMONIC,
    baseUrl: process.env.MDK_API_BASE_URL,
    nodeOptions: Object.keys(nodeOptions).length > 0 ? nodeOptions : undefined,
  }
}

export function resolveMoneyDevKitOptions(): MoneyDevKitOptions {
  const env = readEnv()
  const { accessToken, mnemonic, baseUrl, nodeOptions } = env

  if (!accessToken || !mnemonic) {
    throw new Error(
      'MoneyDevKit requires MDK_ACCESS_TOKEN and MDK_MNEMONIC environment variables to be configured.',
    )
  }

  const overrides = nodeOptions ?? {}
  const networkOverride = overrides.network ?? MAINNET_MDK_NODE_OPTIONS.network
  const defaultNodeOptions =
    networkOverride === 'signet' ? SIGNET_MDK_NODE_OPTIONS : MAINNET_MDK_NODE_OPTIONS
  const mergedNodeOptions: MoneyDevKitOptions['nodeOptions'] = {
    ...defaultNodeOptions,
    ...overrides,
  }

  const network = mergedNodeOptions.network ?? defaultNodeOptions.network
  mergedNodeOptions.network = network

  const resolvedBaseUrl =
    baseUrl ?? (network === 'signet' ? SIGNET_MDK_BASE_URL : MAINNET_MDK_BASE_URL)

  return {
    accessToken,
    mnemonic,
    baseUrl: resolvedBaseUrl,
    nodeOptions: mergedNodeOptions,
  }
}

export function createMoneyDevKitClient() {
  const resolved = resolveMoneyDevKitOptions()
  return new MoneyDevKitClient({
    accessToken: resolved.accessToken,
    baseUrl: resolved.baseUrl ?? MAINNET_MDK_BASE_URL,
  })
}

export function createMoneyDevKitNode() {
  const resolved = resolveMoneyDevKitOptions()
  return new MoneyDevKitNode({
    accessToken: resolved.accessToken,
    mnemonic: resolved.mnemonic,
    nodeOptions: resolved.nodeOptions,
  })
}
