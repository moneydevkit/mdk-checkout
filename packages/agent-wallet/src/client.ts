import { ensureApiToken } from './config.js'
import type { PaymentStatus, StoredPayment } from './payment-store.js'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export class WalletClient {
  private baseUrl: string
  private apiToken: string

  /** `apiToken` defaults to the shared token file, which the daemon reads too. */
  constructor(port: number, apiToken: string = ensureApiToken()) {
    this.baseUrl = `http://127.0.0.1:${port}`
    this.apiToken = apiToken
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = (await response.json()) as ApiResponse<T>

    if (!data.success) {
      throw new Error(data.error?.message ?? 'Request failed')
    }

    return data.data as T
  }

  async health(): Promise<{ status: string; nodeRunning: boolean; pid: number }> {
    return this.request('GET', '/health')
  }

  async balance(): Promise<{ balanceSats: number }> {
    return this.request('GET', '/balance')
  }

  async receive(amountSats?: number, description?: string): Promise<{
    invoice: string
    paymentHash: string
    expiresAt: string
  }> {
    return this.request('POST', '/receive', {
      amount_sats: amountSats,
      description,
    })
  }

  async receiveBolt12(description?: string): Promise<{
    offer: string
  }> {
    return this.request('POST', '/receive-bolt12', {
      description,
    })
  }

  async send(destination: string, amountSats?: number): Promise<{
    paymentId: string
    paymentHash: string | null
    status: PaymentStatus
  }> {
    return this.request('POST', '/send', {
      destination,
      amount_sats: amountSats,
    })
  }

  async getPayment(paymentId: string): Promise<StoredPayment> {
    return this.request('GET', `/payment/${paymentId}`)
  }

  async payments(): Promise<{ payments: StoredPayment[] }> {
    return this.request('GET', '/payments')
  }
}
