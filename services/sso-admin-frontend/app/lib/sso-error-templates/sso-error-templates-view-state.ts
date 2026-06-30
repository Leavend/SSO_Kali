import { ApiError } from '@/lib/api/api-client'
import type { StatusTone } from '@/lib/status-tone'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

export type SsoErrorTemplatesViewState =
  | 'loading'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
  | 'empty'
  | 'ready'

export function resolveSsoErrorTemplatesViewState({
  error,
  templates,
}: {
  readonly pending: boolean
  readonly error: unknown
  readonly templates: readonly SsoErrorTemplate[] | null
}): SsoErrorTemplatesViewState {
  if (error && !templates) {
    const status = errorStatus(error)
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    return 'error'
  }
  if (templates) return templates.length === 0 ? 'empty' : 'ready'
  return 'loading'
}

// Swiss: enabled = success tone, disabled = neutral. A disabled template is a
// deliberate operational state, not an error — #E4002B/--danger stays reserved
// for destructive affordances + inline validation. The badge carries tone AND
// label; colour is never load-bearing.
export function resolveEnabledTone(isEnabled: boolean): StatusTone {
  return isEnabled ? 'success' : 'neutral'
}

// error_code is not unique on its own (one code has an `id` and an `en` row), so
// the list key + selection identity is the error_code+locale pair.
export function templateKey(template: Pick<SsoErrorTemplate, 'error_code' | 'locale'>): string {
  return `${template.error_code}::${template.locale}`
}

function errorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown; status?: unknown }
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    if (typeof candidate.status === 'number') return candidate.status
  }
  return null
}
