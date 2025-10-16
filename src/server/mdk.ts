import { MoneyDevKit, type MoneyDevKitOptions } from './money-dev-kit'

const globalKey = Symbol.for('mdk-checkout:money-dev-kit')
type GlobalWithMdk = typeof globalThis & {
  [globalKey]?: {
    instance: MoneyDevKit | null
    optionsSignature: string | null
  }
}

function getGlobalState() {
  const globalObject = globalThis as GlobalWithMdk
  if (!globalObject[globalKey]) {
    globalObject[globalKey] = { instance: null, optionsSignature: null }
  }
  return globalObject[globalKey]!
}

export interface ResolveMoneyDevKitOptions {
  accessToken?: string
  mnemonic?: string
  baseUrl?: string
  nodeOptions?: MoneyDevKitOptions['nodeOptions']
}

function readEnv(): ResolveMoneyDevKitOptions {
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

function serializeOptions(options: MoneyDevKitOptions) {
  const { accessToken, mnemonic, ...rest } = options
  return JSON.stringify({
    accessToken,
    mnemonic,
    ...rest,
  })
}

export function resolveMoneyDevKitOptions(
  overrides: ResolveMoneyDevKitOptions = {},
): MoneyDevKitOptions {
  const env = readEnv()
  const accessToken = overrides.accessToken ?? env.accessToken
  const mnemonic = overrides.mnemonic ?? env.mnemonic

  if (!accessToken || !mnemonic) {
    throw new Error(
      'MoneyDevKit requires MDK_ACCESS_TOKEN and MDK_MNEMONIC to be configured. Provide them via environment variables or pass them explicitly to resolveMoneyDevKitOptions().',
    )
  }

  // Merge nodeOptions: env vars as defaults, overrides take precedence
  const nodeOptions: MoneyDevKitOptions['nodeOptions'] = {
    ...env.nodeOptions,
    ...overrides.nodeOptions,
  }

  return {
    accessToken,
    mnemonic,
    baseUrl: overrides.baseUrl ?? env.baseUrl,
    nodeOptions: Object.keys(nodeOptions).length > 0 ? nodeOptions : undefined,
  }
}

export function getMoneyDevKit(options: ResolveMoneyDevKitOptions = {}) {
  const state = getGlobalState()
  const resolved = resolveMoneyDevKitOptions(options)
  const signature = serializeOptions(resolved)

  if (!state.instance || state.optionsSignature !== signature) {
    // Cleanup old instance if credentials have changed
    if (state.instance && state.optionsSignature !== signature) {
      console.log('[MoneyDevKit] Configuration changed, reinitializing...')
      try {
        // Call shutdown if available (for future-proofing)
        if (typeof (state.instance as any).shutdown === 'function') {
          (state.instance as any).shutdown()
        }
      } catch (error) {
        console.warn('[MoneyDevKit] Error during cleanup:', error)
      }
    }

    console.log('[MoneyDevKit] Initializing new instance')
    state.instance = new MoneyDevKit(resolved)
    state.optionsSignature = signature
  }

  return state.instance
}

export { MoneyDevKit }
