type LightningLogEntry = unknown
type LightningLogHandler = (entry: LightningLogEntry) => void

import { isLoggingEnabled, log, warn } from './logging'

const loggingEnabled = isLoggingEnabled()

const LOG_GROUP_SIZE =
  Number.parseInt(process.env.MDK_LIGHTNING_LOG_GROUP_SIZE ?? '', 10) || 6
const LOG_GROUP_FLUSH_INTERVAL_MS =
  Number.parseInt(process.env.MDK_LIGHTNING_LOG_GROUP_INTERVAL_MS ?? '', 10) || 250
const LOG_MAX_LINE_BYTES = 256 * 1024
const LOG_MAX_SUM_BYTES = 1024 * 1024

class LightningLogAggregator {
  private buffer: unknown[] = []
  private bufferedBytes = 0
  private flushTimer: NodeJS.Timeout | null = null

  add(entry: LightningLogEntry) {
    const { value, serialized } = this.prepare(entry)
    const bytes = Buffer.byteLength(serialized, 'utf8')

    if (bytes >= LOG_MAX_LINE_BYTES) {
      this.flush()
      log(
        JSON.stringify({
          truncated: true,
          preview: serialized.slice(0, LOG_MAX_LINE_BYTES - 100),
        }),
      )
      return
    }

    if (this.bufferedBytes + bytes > Math.min(LOG_MAX_SUM_BYTES, LOG_MAX_LINE_BYTES)) {
      this.flush()
    }

    this.buffer.push(value)
    this.bufferedBytes += bytes

    if (this.buffer.length >= LOG_GROUP_SIZE || this.bufferedBytes >= LOG_MAX_LINE_BYTES) {
      this.flush()
    } else {
      this.ensureTimer()
    }
  }

  flush() {
    if (this.buffer.length === 0) {
      return
    }

    for (const entry of this.buffer) {
      log(JSON.stringify(entry))
    }

    this.buffer = []
    this.bufferedBytes = 0
    this.clearTimer()
  }

  private ensureTimer() {
    if (this.flushTimer) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, LOG_GROUP_FLUSH_INTERVAL_MS)

    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref()
    }
  }

  private clearTimer() {
    if (!this.flushTimer) {
      return
    }

    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private prepare(entry: LightningLogEntry) {
    const normalised = this.normalise(entry)
    const coerced = this.coerce(normalised)
    const { value, serialized } = this.ensureSerializable(coerced)

    return { value, serialized }
  }

  private ensureSerializable(value: unknown) {
    if (typeof value === 'string') {
      return { value, serialized: value }
    }

    try {
      return { value, serialized: JSON.stringify(value) }
    } catch (error) {
      const fallback = `[lightning-log] Failed to stringify entry: ${String(error)}`
      return { value: fallback, serialized: fallback }
    }
  }

  private coerce(value: unknown): unknown {
    if (value == null) {
      return ''
    }

    if (Buffer.isBuffer(value)) {
      return this.coerce(value.toString('utf8'))
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()

      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return JSON.parse(trimmed)
        } catch {
          return value
        }
      }

      return value
    }

    return value
  }

  private normalise(entry: LightningLogEntry): unknown {
    if (entry instanceof Error) {
      return {
        source: 'mdk-lightning',
        level: 'error',
        name: entry.name,
        message: entry.message,
        stack: entry.stack,
      }
    }

    if (typeof entry === 'object' && entry !== null) {
      return entry
    }

    return entry
  }
}

const lightningLogAggregator = new LightningLogAggregator()

export const lightningLogHandler: LightningLogHandler = (entry) => {
  if (!loggingEnabled) {
    return
  }

  lightningLogAggregator.add(entry)
}

export const lightningLogErrorHandler = (error: unknown) => {
  if (!loggingEnabled) {
    return
  }

  const payload =
    error instanceof Error
      ? {
        level: 'error',
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
      : {
        level: 'error',
        error,
      }

  lightningLogAggregator.add(payload)
}

const registerAggregatorFlush = (() => {
  let registered = false
  return () => {
    if (registered) {
      return
    }
    registered = true

    const flush = () => {
      try {
        lightningLogAggregator.flush()
      } catch (error) {
        warn('MoneyDevKit lightning log flush failed', error)
      }
    }

    process.on('beforeExit', flush)
    process.on('exit', flush)
    process.on('SIGINT', flush)
    process.on('SIGTERM', flush)
  }
})()

if (loggingEnabled) {
  registerAggregatorFlush()
}
