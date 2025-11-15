import { Agent, setGlobalDispatcher } from 'undici'

declare global {
  // eslint-disable-next-line no-var
  var __mdkUndiciDispatcherConfigured: boolean | undefined
}

export const ensureUndiciDispatcher = () => {
  if (globalThis.__mdkUndiciDispatcherConfigured) {
    return
  }

  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 1,
      keepAliveTimeoutThreshold: 1,
    }),
  )

  globalThis.__mdkUndiciDispatcherConfigured = true
}

ensureUndiciDispatcher()
