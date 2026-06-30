import type { IpAccessMode, IpAccessRuleCreatePayload } from '@/types/ip-access.types'

export type IpAccessFormModel = {
  cidr: string
  mode: IpAccessMode
  reason: string
  expires_at: string
}

// Mirror StoreIpAccessRuleRequest: cidr is IPv4/prefix (the backend uses exactly
// this loose regex — no octet-range check — so the client matches it rather than
// rejecting inputs the backend would accept); reason is required, max 1000.
const CIDR_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/u
const REASON_MAX = 1000

export function validateIpAccessForm(
  form: IpAccessFormModel,
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  const cidr = form.cidr.trim()
  if (!cidr) fieldErrors.cidr = 'required'
  else if (!CIDR_RE.test(cidr)) fieldErrors.cidr = 'pattern'

  const reason = form.reason.trim()
  if (!reason) fieldErrors.reason = 'required'
  else if (reason.length > REASON_MAX) fieldErrors.reason = 'max'

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

export function buildCreateRulePayload(form: IpAccessFormModel): IpAccessRuleCreatePayload {
  const expires = form.expires_at.trim()
  return {
    cidr: form.cidr.trim(),
    mode: form.mode,
    reason: form.reason.trim(),
    ...(expires ? { expires_at: expires } : {}),
  }
}
