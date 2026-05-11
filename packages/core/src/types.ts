export type MdkError = {
  code: string
  message: string
  details?: Array<{ message?: string; path?: Array<string | number> }>
  suggestion?: string
  status?: number
  /**
   * True when the failure is transient and the same call can be retried later.
   * False when retrying without changing inputs or configuration will fail again.
   * Absent when the SDK can't classify the failure; treat as not retryable.
   */
  retryable?: boolean
  /**
   * Short machine-readable reason for the failure (e.g. 'insufficient_fees',
   * 'daily_limit_exceeded'). Present for failures the SDK can categorize.
   */
  reason?: string
}

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: MdkError }

/**
 * Creates a successful Result.
 */
export function success<T>(data: T): Result<T> {
  return { data, error: null }
}

/**
 * Creates a failed Result.
 */
export function failure(error: MdkError): Result<never> {
  return { data: null, error }
}
