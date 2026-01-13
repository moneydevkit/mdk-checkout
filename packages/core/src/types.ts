export type MdkError = {
  code: string
  message: string
  details?: Array<{ message?: string; path?: Array<string | number> }>
  suggestion?: string
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
