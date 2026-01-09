function getEnvFlag(key: string): string | undefined {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
    const value = process.env[key]
    if (value !== undefined) {
      return value
    }
  }

  // Allow bundlers to inject env at build time (e.g., Vite).
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key] !== undefined) {
    return (import.meta as any).env[key]
  }

  if (typeof globalThis !== 'undefined' && (globalThis as any)[key] !== undefined) {
    return (globalThis as any)[key]
  }

  return undefined
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export function is_preview_environment(): boolean {
  // Explicit preview/sandbox flag (check both MDK_PREVIEW and NEXT_PUBLIC_MDK_PREVIEW)
  if (isTruthyFlag(getEnvFlag('MDK_PREVIEW')) || isTruthyFlag(getEnvFlag('NEXT_PUBLIC_MDK_PREVIEW'))) {
    return true
  }

  // Replit sets REPLIT_DEPLOYMENT=1 on published apps.
  if (isTruthyFlag(getEnvFlag('REPLIT_DEPLOYMENT'))) {
    return false
  }

  // REPLIT_DEV_DOMAIN is present in preview/editor environments.
  const devDomain = getEnvFlag('REPLIT_DEV_DOMAIN')
  if (devDomain) {
    return true
  }

  // REPLIT_DOMAINS contains all domains; preview hosts include repl.dev/repl.co.
  const domains = getEnvFlag('REPLIT_DOMAINS') ?? ''
  if (domains.includes('.replit.dev') || domains.includes('.repl.co')) {
    return true
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location?.hostname ?? ''

    if (hostname.endsWith('.repl.co') || hostname.endsWith('.replit.dev')) {
      return true
    }
  }

  return false
}
