export type MdkError = {
  code: string
  message: string
  details?: Array<{ message?: string; path?: Array<string | number> }>
  suggestion?: string
}

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: MdkError }

