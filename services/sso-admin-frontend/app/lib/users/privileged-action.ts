import { ApiError, getLastRequestId } from '@/lib/api/api-client'

// One canonical mapping from a transport error to an operator-safe action
// outcome. Pure: no Vue, no network, no DOM — every write/destructive/role
// action in the Users domain routes its failures through here, so the
// status/field-error/step-up/correlation matrix is unit-testable in isolation.
export type PrivilegedActionStatus =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'forbidden'
  | 'unauthenticated'
  | 'step_up_required'
  | 'rate_limited'
  | 'invalid'
  | 'error'

export type PrivilegedActionFailureStatus = Exclude<
  PrivilegedActionStatus,
  'idle' | 'submitting' | 'success'
>

export type PrivilegedActionFailure = {
  readonly status: PrivilegedActionFailureStatus
  readonly requestId: string | null
  readonly auditEventId: string | null
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>
  readonly stepUpUrl: string | null
}

// Shape of the JSON body the backend attaches to a failed admin mutation.
// All fields optional — the middleware/controller envelopes differ by status
// (validation: { message, errors }; middleware: { error, error_description,
// step_up_url }; controller: { error, message }).
type ErrorPayload = {
  readonly errors?: Readonly<Record<string, readonly string[]>>
  readonly audit_event_id?: string | null
  readonly step_up_url?: string | null
}

function readPayload(payload: unknown): ErrorPayload {
  return typeof payload === 'object' && payload !== null ? (payload as ErrorPayload) : {}
}

function isStepUp(error: ApiError): boolean {
  return (
    error.status === 428 ||
    error.status === 412 ||
    error.code === 'reauth_required' ||
    error.code === 'step_up_required'
  )
}

function mapStatus(error: ApiError): PrivilegedActionFailureStatus {
  // Step-up is checked first: the backend can emit a step-up code on a 403/428,
  // and re-authentication must take precedence over a plain "forbidden" surface.
  if (isStepUp(error)) return 'step_up_required'
  if (error.status === 401 || error.status === 419) return 'unauthenticated'
  if (error.status === 403) return 'forbidden'
  if (error.status === 422) return 'invalid'
  if (error.status === 429) return 'rate_limited'
  return 'error'
}

export function resolvePrivilegedActionFailure(error: unknown): PrivilegedActionFailure {
  if (!(error instanceof ApiError)) {
    return {
      status: 'error',
      requestId: getLastRequestId(),
      auditEventId: null,
      fieldErrors: {},
      stepUpUrl: null,
    }
  }
  const payload = readPayload(error.payload)
  const status = mapStatus(error)
  return {
    status,
    requestId: error.requestId ?? getLastRequestId(),
    auditEventId: payload.audit_event_id ?? null,
    fieldErrors: status === 'invalid' ? (payload.errors ?? {}) : {},
    stepUpUrl: status === 'step_up_required' ? (payload.step_up_url ?? null) : null,
  }
}
