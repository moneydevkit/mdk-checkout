type MaybePromise<T> = T | Promise<T>

type WebpackCallback = (error?: unknown, result?: string) => void
type WebpackExternal = (context: { request?: string }, callback: WebpackCallback) => void
type WebpackExternalItem = WebpackExternal | string | RegExp | Record<string, unknown>
type WebpackExternals = WebpackExternalItem | WebpackExternalItem[]

interface WebpackConfiguration {
  externals?: WebpackExternals
  [key: string]: unknown
}

interface NextWebpackContext {
  isServer: boolean
  [key: string]: unknown
}

type NextWebpack = (
  config: WebpackConfiguration,
  context: NextWebpackContext,
) => MaybePromise<WebpackConfiguration | void>

export interface NextConfigOverrides {
  serverExternalPackages?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
  webpack?: NextWebpack
  [key: string]: unknown
}

const lightningPackage = '@moneydevkit/lightning-js'
const binaryPackages = [
  '@moneydevkit/lightning-js-linux-x64-gnu',
  '@moneydevkit/lightning-js-linux-x64-musl',
  '@moneydevkit/lightning-js-linux-arm64-gnu',
  '@moneydevkit/lightning-js-linux-arm64-musl',
  '@moneydevkit/lightning-js-linux-arm-gnueabihf',
  '@moneydevkit/lightning-js-android-arm64',
  '@moneydevkit/lightning-js-android-arm-eabi',
  '@moneydevkit/lightning-js-win32-x64-msvc',
  '@moneydevkit/lightning-js-win32-ia32-msvc',
  '@moneydevkit/lightning-js-win32-arm64-msvc',
  '@moneydevkit/lightning-js-darwin-x64',
  '@moneydevkit/lightning-js-darwin-arm64',
  '@moneydevkit/lightning-js-freebsd-x64',
]

const tracingGlobs = [
  './node_modules/@moneydevkit/lightning-js/**',
  './node_modules/@moneydevkit/lightning-js-*/**',
]

const mergeUnique = (source: string[] | undefined, items: string[]): string[] => {
  const existing = new Set(source ?? [])
  for (const item of items) {
    existing.add(item)
  }
  return Array.from(existing)
}

const lightningWebpackExternal: WebpackExternal = ({ request }, callback) => {
  if (typeof request === 'string') {
    if (request === lightningPackage || request.startsWith(`${lightningPackage}-`)) {
      callback(undefined, `commonjs ${request}`)
      return
    }
  }
  callback()
}

const addLightningExternals = (config: WebpackConfiguration): void => {
  const { externals } = config

  if (!externals) {
    config.externals = [lightningWebpackExternal]
    return
  }

  if (Array.isArray(externals)) {
    if (!externals.includes(lightningWebpackExternal)) {
      config.externals = [...externals, lightningWebpackExternal]
    }
    return
  }

  if (externals === lightningWebpackExternal) {
    return
  }

  config.externals = [externals, lightningWebpackExternal]
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function'

export function withMdkCheckout<T extends NextConfigOverrides>(config: T = {} as T): T {
  const serverExternalPackages = mergeUnique(config.serverExternalPackages, [
    lightningPackage,
    ...binaryPackages,
  ])

  const outputFileTracingIncludes = { ...(config.outputFileTracingIncludes ?? {}) }
  outputFileTracingIncludes['*'] = mergeUnique(outputFileTracingIncludes['*'], tracingGlobs)

  const existingWebpack = config.webpack

  const webpack: NextWebpack = (webpackConfig, context) => {
    const applyLightning = (result?: WebpackConfiguration | void): WebpackConfiguration => {
      const finalConfig = (result ?? webpackConfig)
      if (context.isServer) {
        addLightningExternals(finalConfig)
      }
      return finalConfig
    }

    if (typeof existingWebpack === 'function') {
      const maybeResult = existingWebpack(webpackConfig, context)
      if (isThenable(maybeResult)) {
        return maybeResult.then(applyLightning)
      }
      return applyLightning(maybeResult)
    }

    return applyLightning(undefined)
  }

  return {
    ...config,
    serverExternalPackages,
    outputFileTracingIncludes,
    webpack,
  }
}

export default withMdkCheckout
