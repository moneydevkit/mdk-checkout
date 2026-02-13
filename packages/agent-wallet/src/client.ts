export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export class WalletClient {
  private baseUrl: string

  constructor(port: number) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = (await response.json()) as ApiResponse<T>

    if (!data.success) {
      throw new Error(data.error?.message ?? 'Request failed')
    }

    return data.data as T
  }

  async health(): Promise<{ status: string; nodeRunning: boolean }> {
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

  async send(destination: string, amountSats?: number): Promise<{ paymentId: string; paymentHash: string | null; preimage: string | null }> {
    return this.request('POST', '/send', {
      destination,
      amount_sats: amountSats,
    })
  }

  async payments(): Promise<{
    payments: Array<{
      paymentId?: string
      paymentHash: string | null
      amountSats: number
      direction: 'inbound' | 'outbound'
      timestamp: number
      destination?: string
    }>
  }> {
    return this.request('GET', '/payments')
  }
}
