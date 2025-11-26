import { createRequire } from 'module'

type UndiciModule = typeof import('undici')

declare global {
  // eslint-disable-next-line no-var
  var __mdkUndiciDispatcherConfigured: boolean | undefined
}

const isNodeRuntime = () =>
  typeof process !== 'undefined' && !!process.versions?.node && process.release?.name === 'node'

const getRuntimeRequire = () => {
  if (typeof require === 'function') {
    return require
  }

  return createRequire(import.meta.url)
}

const loadUndici = (): UndiciModule | undefined => {
  if (!isNodeRuntime()) {
    return undefined
  }

  try {
    return getRuntimeRequire()('undici') as UndiciModule
  } catch {
    // Fall back to global fetch if undici cannot be loaded (e.g. non-Node runtimes).
    return undefined
  }
}

export const ensureUndiciDispatcher = () => {
  if (globalThis.__mdkUndiciDispatcherConfigured) {
    return
  }

  const undici = loadUndici()

  if (!undici) {
    return
  }

  const { Agent, setGlobalDispatcher } = undici

  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 1,
      keepAliveTimeoutThreshold: 1,
    }),
  )

  globalThis.__mdkUndiciDispatcherConfigured = true
}
