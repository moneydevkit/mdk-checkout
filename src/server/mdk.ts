import { MoneyDevKit, type MoneyDevKitOptions } from './money-dev-kit'

const globalKey = Symbol.for('mdk-checkout:money-dev-kit')
type GlobalWithMdk = typeof globalThis & {
  [globalKey]?: {
    instance: MoneyDevKit | null
    optionsSignature: string | null
  }
}

type NodeOptions = NonNullable<MoneyDevKitOptions['nodeOptions']>

export const DEFAULT_MDK_BASE_URL = 'https://staging.moneydevkit.com/rpc'

export const DEFAULT_MDK_NODE_OPTIONS: NodeOptions = {
  network: 'signet',
  vssUrl: 'https://vss.staging.moneydevkit.com/vss',
  esploraUrl: 'https://mutinynet.com/api',
  rgsUrl: 'https://rgs.mutinynet.com/snapshot',
  lspNodeId: '03fd9a377576df94cc7e458471c43c400630655083dee89df66c6ad38d1b7acffd',
  lspAddress: '3.21.138.98:9735',
}

function getGlobalState() {
  const globalObject = globalThis as GlobalWithMdk
  if (!globalObject[globalKey]) {
    globalObject[globalKey] = { instance: null, optionsSignature: null }
  }
  return globalObject[globalKey]!
}

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

function serializeOptions(options: MoneyDevKitOptions) {
  const { accessToken, mnemonic, ...rest } = options
  return JSON.stringify({
    accessToken,
    mnemonic,
    ...rest,
  })
}

export function resolveMoneyDevKitOptions(): MoneyDevKitOptions {
  const env = readEnv()
  const { accessToken, mnemonic, baseUrl, nodeOptions } = env

  if (!accessToken || !mnemonic) {
    throw new Error(
      'MoneyDevKit requires MDK_ACCESS_TOKEN and MDK_MNEMONIC environment variables to be configured.',
    )
  }

  return {
    accessToken,
    mnemonic,
    baseUrl,
    nodeOptions: {
      ...DEFAULT_MDK_NODE_OPTIONS,
      ...nodeOptions,
    },
  }
}

export function getMoneyDevKit() {
  const state = getGlobalState()
  const resolved = resolveMoneyDevKitOptions()
  const signature = serializeOptions(resolved)

  if (!state.instance || state.optionsSignature !== signature) {
    state.instance = new MoneyDevKit(resolved)
    state.optionsSignature = signature
  }

  return state.instance
}

export { MoneyDevKit }
