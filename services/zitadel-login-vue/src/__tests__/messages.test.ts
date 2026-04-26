import { describe, expect, it } from 'vitest'

import { LOGIN_MESSAGES } from '../shared/messages'

describe('Indonesian validation messages', () => {
  it('keeps authentication errors localized', () => {
    expect(LOGIN_MESSAGES.invalidCredentials).toContain('Email')
    expect(LOGIN_MESSAGES.invalidOtpCode).toContain('Kode autentikator')
    expect(LOGIN_MESSAGES.missingSession).toContain('Sesi masuk')
  })
})
