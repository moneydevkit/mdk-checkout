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
  return {
    accessToken: process.env.MDK_ACCESS_TOKEN,
    mnemonic: process.env.MDK_MNEMONIC,
    baseUrl: process.env.MDK_API_BASE_URL,
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

  return {
    accessToken,
    mnemonic,
    baseUrl: overrides.baseUrl ?? env.baseUrl,
    nodeOptions: overrides.nodeOptions,
  }
}

export function getMoneyDevKit(options: ResolveMoneyDevKitOptions = {}) {
  const state = getGlobalState()
  const resolved = resolveMoneyDevKitOptions(options)
  const signature = serializeOptions(resolved)

  if (!state.instance || state.optionsSignature !== signature) {
    state.instance = new MoneyDevKit(resolved)
    state.optionsSignature = signature
  }

  return state.instance
}

export { MoneyDevKit }
