import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

// The five backend categories (SecurityPolicy::CATEGORIES), in display order.
export const POLICY_CATEGORIES: readonly SecurityPolicyCategory[] = [
  'password',
  'mfa',
  'session',
  'lockout',
  'legal_hold',
]

export function isPolicyCategory(value: string): value is SecurityPolicyCategory {
  return (POLICY_CATEGORIES as readonly string[]).includes(value)
}

// Parse the draft-payload textarea into a JSON object. The backend wants
// `payload => required|array` (a JSON object); reject syntax errors and non-object
// JSON (arrays, scalars, null) up front so the operator sees the problem before the
// round-trip. Never throws — returns a discriminated result.
export type ParsedPolicyPayload =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: 'syntax' | 'not_object' }

export function parsePolicyPayload(text: string): ParsedPolicyPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'syntax' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not_object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

export function findActiveVersion(policies: readonly SecurityPolicy[]): number | null {
  return policies.find((p) => p.status === 'active')?.version ?? null
}

// Pure summary behind the activate/rollback confirm copy: which version becomes
// active and which one (if any) it replaces.
export type PolicyTransitionImpact = {
  readonly targetVersion: number
  readonly activeVersion: number | null
  readonly replacesActive: boolean
}

export function describeTransitionImpact(
  targetVersion: number,
  activeVersion: number | null,
): PolicyTransitionImpact {
  return {
    targetVersion,
    activeVersion,
    replacesActive: activeVersion !== null && activeVersion !== targetVersion,
  }
}
