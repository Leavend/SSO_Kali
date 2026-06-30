import { describe, expect, it } from 'vitest'
import {
  buildCreateRulePayload,
  validateIpAccessForm,
  type IpAccessFormModel,
} from '@/lib/ip-access/ip-access-form'

function model(overrides: Partial<IpAccessFormModel> = {}): IpAccessFormModel {
  return { cidr: '203.0.113.0/24', mode: 'block', reason: 'maint', expires_at: '', ...overrides }
}

describe('validateIpAccessForm', () => {
  it('passes a well-formed rule', () => {
    expect(validateIpAccessForm(model())).toEqual({ valid: true, fieldErrors: {} })
  })
  it('requires cidr and reason', () => {
    const r = validateIpAccessForm(model({ cidr: '   ', reason: '' }))
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.cidr).toBe('required')
    expect(r.fieldErrors.reason).toBe('required')
  })
  it('rejects a malformed cidr (mirrors the backend regex)', () => {
    expect(validateIpAccessForm(model({ cidr: 'not-a-cidr' })).fieldErrors.cidr).toBe('pattern')
    expect(validateIpAccessForm(model({ cidr: '10.0.0.1' })).fieldErrors.cidr).toBe('pattern')
  })
  it('rejects a reason longer than 1000 chars', () => {
    expect(validateIpAccessForm(model({ reason: 'x'.repeat(1001) })).fieldErrors.reason).toBe('max')
  })
})

describe('buildCreateRulePayload', () => {
  it('trims and includes the required fields, omitting blank expires_at', () => {
    expect(buildCreateRulePayload(model({ cidr: ' 10.0.0.0/8 ', reason: '  hi  ' }))).toEqual({
      cidr: '10.0.0.0/8',
      mode: 'block',
      reason: 'hi',
    })
  })
  it('includes expires_at (trimmed) when present', () => {
    expect(
      buildCreateRulePayload(model({ expires_at: ' 2027-01-01T00:00:00Z ' })).expires_at,
    ).toBe('2027-01-01T00:00:00Z')
  })
})
