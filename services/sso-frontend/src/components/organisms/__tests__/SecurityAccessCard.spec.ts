import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SecurityAccessCard from '../SecurityAccessCard.vue'

describe('SecurityAccessCard', () => {
  it('keeps access descriptions behind info tooltips instead of inline copy', () => {
    const wrapper = mount(SecurityAccessCard, {
      props: {
        roles: ['portal-user'],
        permissions: ['sessions.revoke', 'mfa.manage'],
        scopes: ['openid', 'offline_access', 'custom.scope'],
      },
    })

    expect(wrapper.text()).toContain('Peran')
    expect(wrapper.text()).toContain('Izin')
    expect(wrapper.text()).toContain('Cakupan Akses')
    expect(wrapper.text()).toContain('portal-user')
    expect(wrapper.text()).toContain('sessions.revoke')
    expect(wrapper.text()).toContain('mfa.manage')
    expect(wrapper.text()).toContain('Identitas Dasar')
    expect(wrapper.text()).toContain('openid')
    expect(wrapper.text()).toContain('Akses Offline (Refresh Token)')
    expect(wrapper.text()).toContain('offline_access')
    expect(wrapper.text()).toContain(
      'Peran, izin, dan cakupan akses yang ditetapkan oleh administrator',
    )
    expect(wrapper.text()).toContain('Cakupan Akses Baru')
    expect(wrapper.text()).toContain('Belum Diverifikasi')
    expect(wrapper.text()).toContain('custom.scope')
    const permissionRows = wrapper.findAll('[data-testid="permission-access-item"]')
    const scopeRows = wrapper.findAll('[data-testid="scope-access-item"]')
    const permissionInfo = wrapper.find('[data-testid="permission-info-sessions-revoke"]')
    const scopeInfo = wrapper.find('[data-testid="scope-info-openid"]')

    expect(permissionRows[0].find('[data-testid="access-item-main"]').text()).not.toContain(
      'Mengakhiri sesi aktif dari perangkat lain',
    )
    expect(permissionRows[1].find('[data-testid="access-item-main"]').text()).not.toContain(
      'Mengelola aplikasi autentikasi dan kode cadangan',
    )
    expect(scopeRows[0].find('[data-testid="access-item-main"]').text()).not.toContain(
      'Mengizinkan aplikasi mengetahui bahwa kamu login',
    )
    expect(permissionInfo.attributes('aria-label')).toContain('Mengakhiri sesi aktif dari perangkat lain')
    expect(scopeInfo.attributes('aria-label')).toContain(
      'Mengizinkan aplikasi mengetahui bahwa kamu login dengan akun SSO ini',
    )
    expect(permissionRows[0].find('[data-testid="access-info-tooltip"]').text()).toContain(
      'Mengakhiri sesi aktif dari perangkat lain',
    )
  })

  it('wraps long access tokens inside narrow portal cards', () => {
    const wrapper = mount(SecurityAccessCard, {
      props: {
        roles: ['portal-user-with-a-very-long-name'],
        permissions: ['sessions.revoke.with.long.suffix'],
        scopes: ['custom.scope.with.a.very.long.unbroken.identifier'],
      },
    })

    const content = wrapper.find('[data-slot="card-content"]')
    const scopeCode = wrapper.find('code')

    expect(content.classes()).toContain('min-w-0')
    expect(scopeCode.classes()).toContain('break-all')
  })
})
