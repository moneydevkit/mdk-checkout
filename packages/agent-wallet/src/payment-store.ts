import * as fs from 'node:fs'
import * as path from 'node:path'

export type PaymentStatus = 'pending' | 'completed' | 'failed'

export interface StoredPayment {
  paymentId?: string
  paymentHash: string | null
  amountSats: number
  direction: 'inbound' | 'outbound'
  timestamp: number
  destination?: string
  payerNote?: string
  preimage?: string
  status: PaymentStatus
}

/** Mutable fields that can be updated after initial creation. */
type UpdatableFields = Partial<Pick<StoredPayment, 'status' | 'preimage' | 'paymentHash'>>

/**
 * Persistent JSON-file-backed payment store.
 *
 * All operations are synchronous (fs.*Sync) and safe on a single-threaded
 * Node.js event loop — setInterval callbacks cannot interleave with a
 * synchronous write.
 */
export class PaymentStore {
  constructor(private readonly filePath: string) {}

  /** Load all stored payments, backfilling status for legacy records that predate the field. */
  load(): StoredPayment[] {
    if (!fs.existsSync(this.filePath)) {
      return []
    }

    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      const payments = JSON.parse(data) as StoredPayment[]
      // Legacy records predate the status field — treat them as completed
      // since they were only saved after the blocking 30s wait settled.
      for (const p of payments) {
        p.status ??= 'completed'
      }
      return payments
    } catch {
      return []
    }
  }

  /** Append a new payment record. */
  save(payment: StoredPayment): void {
    this.ensureDir()
    const payments = this.load()
    payments.push(payment)
    this.write(payments)
  }

  /** Update fields on an existing payment found by paymentId. Returns true if found. */
  update(paymentId: string, updates: UpdatableFields): boolean {
    const payments = this.load()
    const idx = payments.findIndex((p) => p.paymentId === paymentId)
    if (idx === -1) return false

    payments[idx] = { ...payments[idx], ...updates }
    this.write(payments)
    return true
  }

  /** Find a single payment by paymentId. */
  find(paymentId: string): StoredPayment | undefined {
    return this.load().find((p) => p.paymentId === paymentId)
  }

  private write(payments: StoredPayment[]): void {
    this.ensureDir()
    fs.writeFileSync(this.filePath, JSON.stringify(payments, null, 2), { mode: 0o600 })
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
  }
}
