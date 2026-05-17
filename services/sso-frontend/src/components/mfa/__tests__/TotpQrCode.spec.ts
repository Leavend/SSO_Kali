import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TotpQrCode from '../TotpQrCode.vue'

describe('TotpQrCode', () => {
  it('renders a local QR data URL and never calls an external QR service', () => {
    const wrapper = mount(TotpQrCode, {
      props: {
        provisioningUri: 'otpauth://totp/Dev-SSO:user@example.test?secret=SECRET&issuer=Dev-SSO',
        secret: 'SECRET',
      },
    })

    const src = wrapper.find('img').attributes('src') ?? ''

    expect(src).toMatch(/^data:image\/svg\+xml;base64,/u)
    expect(src).not.toContain('api.qrserver.com')
    expect(src).not.toContain('SECRET')
  })
})
