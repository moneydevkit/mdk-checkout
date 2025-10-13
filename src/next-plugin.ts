export interface NextConfigOverrides {
  serverExternalPackages?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
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

export function withMdkCheckout<T extends NextConfigOverrides>(config: T = {} as T): T {
  const serverExternalPackages = mergeUnique(config.serverExternalPackages, [
    lightningPackage,
    ...binaryPackages,
  ])

  const tracing = { ...(config.outputFileTracingIncludes ?? {}) }
  const wildcard = mergeUnique(tracing['*'], tracingGlobs)
  tracing['*'] = wildcard

  return {
    ...config,
    serverExternalPackages,
    outputFileTracingIncludes: tracing,
  }
}

export default withMdkCheckout
