export interface NextConfigOverrides {
  serverExternalPackages?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
  [key: string]: unknown
}

const lightningPackage = '@moneydevkit/lightning-js'
const lightningTraceGlob = './node_modules/@moneydevkit/lightning-js/**'

const mergeUnique = (source: string[] | undefined, items: string[]): string[] => {
  const existing = new Set(source ?? [])
  for (const item of items) {
    existing.add(item)
  }
  return Array.from(existing)
}

export function withMdkCheckout<T extends NextConfigOverrides>(config: T = {} as T): T {
  const serverExternalPackages = mergeUnique(config.serverExternalPackages, [lightningPackage])

  const tracing = { ...(config.outputFileTracingIncludes ?? {}) }
  const wildcard = mergeUnique(tracing['*'], [lightningTraceGlob])
  tracing['*'] = wildcard

  return {
    ...config,
    serverExternalPackages,
    outputFileTracingIncludes: tracing,
  }
}

export default withMdkCheckout
