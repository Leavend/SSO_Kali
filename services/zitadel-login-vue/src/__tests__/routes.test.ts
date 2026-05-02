import { describe, expect, it } from 'vitest'

import {
  LEGACY_BASE_PATH,
  normalizeBasePath,
  sanitizeFlowId,
  sanitizeLoginHint,
  sanitizeLoginName,
  sanitizeOtpCode,
  stripBasePath,
} from '../shared/routes'

describe('login route helpers', () => {
  it('normalizes the custom login base path', () => {
    expect(normalizeBasePath('ui/v2/auth/')).toBe('/ui/v2/auth')
  })

  it('strips the custom base path only for scoped requests', () => {
    expect(stripBasePath('/ui/v2/auth', '/ui/v2/auth/login')).toBe('/login')
    expect(stripBasePath('/ui/v2/auth', '/ui/v2/login/login')).toBeNull()
  })

  it('keeps the legacy login-vue base path explicit for compatibility redirects', () => {
    expect(LEGACY_BASE_PATH).toBe('/ui/v2/login-vue')
    expect(stripBasePath(LEGACY_BASE_PATH, '/ui/v2/login-vue/otp/time-based')).toBe('/otp/time-based')
  })

  it('sanitizes flow and credential form inputs', () => {
    expect(sanitizeFlowId('V2_370134305323614212')).toBe('V2_370134305323614212')
    expect(sanitizeFlowId('bad value with spaces')).toBeNull()
    expect(sanitizeLoginName('  user@example.com  ')).toBe('user@example.com')
    expect(sanitizeLoginHint([' hinted@example.com '])).toBe('hinted@example.com')
    expect(sanitizeOtpCode('12-34 56')).toBe('123456')
  })
})
