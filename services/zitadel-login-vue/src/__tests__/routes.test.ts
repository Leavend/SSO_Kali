import { describe, expect, it } from 'vitest'

import { normalizeBasePath, sanitizeFlowId, sanitizeLoginName, sanitizeOtpCode, stripBasePath } from '../shared/routes'

describe('login route helpers', () => {
  it('normalizes the custom login base path', () => {
    expect(normalizeBasePath('ui/v2/login-vue/')).toBe('/ui/v2/login-vue')
  })

  it('strips the custom base path only for scoped requests', () => {
    expect(stripBasePath('/ui/v2/login-vue', '/ui/v2/login-vue/login')).toBe('/login')
    expect(stripBasePath('/ui/v2/login-vue', '/ui/v2/login/login')).toBeNull()
  })

  it('sanitizes flow and credential form inputs', () => {
    expect(sanitizeFlowId('V2_370134305323614212')).toBe('V2_370134305323614212')
    expect(sanitizeFlowId('bad value with spaces')).toBeNull()
    expect(sanitizeLoginName('  user@example.com  ')).toBe('user@example.com')
    expect(sanitizeOtpCode('12-34 56')).toBe('123456')
  })
})
