// Pure, Nuxt-free descriptor table for the Users lifecycle/destructive actions.
// Each entry encodes the backend contract (extract-backend §2): permission,
// freshness-implied confirm, reason policy, and the danger affordance. No Vue,
// no network, no DOM — unit-testable in isolation so descriptor drift is caught
// before it reaches the surface.
export type UserActionId =
  | 'lock'
  | 'unlock'
  | 'deactivate'
  | 'reactivate'
  | 'reset_mfa'
  | 'password_reset'
  | 'require_mfa'
  | 'unrequire_mfa'

export type ReasonPolicy = {
  readonly required: boolean
  readonly min?: number
  readonly max: number
} | null

export type UserActionDescriptor = {
  readonly id: UserActionId
  readonly permission: 'admin.users.write' | 'admin.users.lock'
  readonly confirmRequired: boolean
  readonly reason: ReasonPolicy
  readonly danger: boolean
}

export const USER_ACTIONS: Readonly<Record<UserActionId, UserActionDescriptor>> = {
  lock: {
    id: 'lock',
    permission: 'admin.users.lock',
    confirmRequired: true,
    reason: { required: true, max: 255 },
    danger: true,
  },
  unlock: {
    id: 'unlock',
    permission: 'admin.users.lock',
    confirmRequired: false,
    reason: { required: false, max: 255 },
    danger: false,
  },
  deactivate: {
    id: 'deactivate',
    permission: 'admin.users.write',
    confirmRequired: true,
    reason: { required: true, max: 255 },
    danger: true,
  },
  reactivate: {
    id: 'reactivate',
    permission: 'admin.users.write',
    confirmRequired: false,
    reason: null,
    danger: false,
  },
  reset_mfa: {
    id: 'reset_mfa',
    permission: 'admin.users.write',
    confirmRequired: true,
    reason: { required: true, min: 8, max: 240 },
    danger: true,
  },
  password_reset: {
    id: 'password_reset',
    permission: 'admin.users.write',
    confirmRequired: true,
    reason: null,
    danger: true,
  },
  require_mfa: {
    id: 'require_mfa',
    permission: 'admin.users.lock',
    confirmRequired: true,
    reason: { required: true, max: 255 },
    danger: true,
  },
  unrequire_mfa: {
    id: 'unrequire_mfa',
    permission: 'admin.users.lock',
    confirmRequired: true,
    reason: { required: true, max: 255 },
    danger: false,
  },
}

export function isReasonValid(policy: ReasonPolicy, value: string): boolean {
  if (policy === null) return true
  const trimmed = value.trim()
  if (trimmed.length === 0) return !policy.required
  if (policy.min !== undefined && trimmed.length < policy.min) return false
  return trimmed.length <= policy.max
}
