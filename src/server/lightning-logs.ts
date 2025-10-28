type LightningLogEntry = unknown
type LightningLogHandler = (entry: LightningLogEntry) => void

const LOG_GROUP_SIZE =
  Number.parseInt(process.env.MDK_LIGHTNING_LOG_GROUP_SIZE ?? '', 10) || 6
const LOG_GROUP_FLUSH_INTERVAL_MS =
  Number.parseInt(process.env.MDK_LIGHTNING_LOG_GROUP_INTERVAL_MS ?? '', 10) || 250
const LOG_MAX_LINE_BYTES = 256 * 1024
const LOG_MAX_SUM_BYTES = 1024 * 1024

class LightningLogAggregator {
  private buffer: string[] = []
  private bufferedBytes = 0
  private flushTimer: NodeJS.Timeout | null = null

  add(entry: LightningLogEntry) {
    const serialized = this.serialize(entry)
    const bytes = Buffer.byteLength(serialized, 'utf8')

    if (bytes >= LOG_MAX_LINE_BYTES) {
      this.flush()
      console.log(
        JSON.stringify({
          source: 'mdk-lightning',
          truncated: true,
          preview: serialized.slice(0, LOG_MAX_LINE_BYTES - 100),
        }),
      )
      return
    }

    if (this.bufferedBytes + bytes > Math.min(LOG_MAX_SUM_BYTES, LOG_MAX_LINE_BYTES)) {
      this.flush()
    }

    this.buffer.push(serialized)
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

    const payload = {
      source: 'mdk-lightning',
      entries: this.buffer,
    }

    console.log(JSON.stringify(payload))

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

  private serialize(entry: LightningLogEntry) {
    const value = this.normalise(entry)

    if (typeof value === 'string') {
      return value
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('utf8')
    }

    if (value == null) {
      return ''
    }

    try {
      return JSON.stringify(value)
    } catch (error) {
      return `[lightning-log] Failed to stringify entry: ${String(error)}`
    }
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
  lightningLogAggregator.add(entry)
}

export const lightningLogErrorHandler = (error: unknown) => {
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
        console.warn('MoneyDevKit lightning log flush failed', error)
      }
    }

    process.on('beforeExit', flush)
    process.on('exit', flush)
    process.on('SIGINT', flush)
    process.on('SIGTERM', flush)
  }
})()

registerAggregatorFlush()
