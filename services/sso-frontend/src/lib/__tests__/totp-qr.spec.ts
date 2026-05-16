import { describe, expect, it } from 'vitest'
import { totpQrDataUrl } from '../totp-qr'

describe('totpQrDataUrl', () => {
  it('builds a local data URL without sending the provisioning URI to a third party', () => {
    const uri = 'otpauth://totp/Dev-SSO:user@example.test?secret=SECRET&issuer=Dev-SSO'
    const dataUrl = totpQrDataUrl(uri)

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/u)
    const svg = atob(dataUrl.replace('data:image/svg+xml;base64,', ''))

    expect(dataUrl).not.toContain('api.qrserver.com')
    expect(dataUrl).not.toContain('SECRET')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
    expect(svg).not.toContain(uri)
  })
})
