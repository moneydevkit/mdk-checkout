import { log } from './logging'

const globalKey = Symbol.for('mdk-checkout:payment-state')

type PaymentState = {
  receivedPaymentHashes: Set<string>
}

function getGlobalPaymentState(): PaymentState {
  const globalObject = globalThis as typeof globalThis & {
    [globalKey]?: PaymentState
  }

  if (!globalObject[globalKey]) {
    globalObject[globalKey] = {
      receivedPaymentHashes: new Set<string>(),
    }
  }

  return globalObject[globalKey]!
}

export function markPaymentReceived(paymentHash: string) {
  if (!paymentHash) return
  const state = getGlobalPaymentState()
  state.receivedPaymentHashes.add(paymentHash)
}

export function hasPaymentBeenReceived(paymentHash: string): boolean {
  if (!paymentHash) return false
  log('hasPaymentBeenReceived. Checking payment received for', paymentHash)
  const state = getGlobalPaymentState()
  log('hasPaymentBeenReceived. Current received payments:', Array.from(state.receivedPaymentHashes))
  return state.receivedPaymentHashes.has(paymentHash)
}

export function clearPayment(paymentHash: string) {
  if (!paymentHash) return
  const state = getGlobalPaymentState()
  state.receivedPaymentHashes.delete(paymentHash)
}
