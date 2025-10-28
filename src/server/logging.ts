const toBoolean = (value?: string) => value?.toLowerCase() === 'true'

const loggingEnabled = toBoolean(process.env.MDK_ENABLE_LOGS)

export const isLoggingEnabled = () => loggingEnabled

export const log: typeof console.log = (...args) => {
  if (!loggingEnabled) {
    return
  }

  console.log(...args)
}

export const warn: typeof console.warn = (...args) => {
  if (!loggingEnabled) {
    return
  }

  console.warn(...args)
}
