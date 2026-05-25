import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SecurityPage from '../SecurityPage.vue'

vi.mock('@/services/mfa.api', () => ({
  mfaApi: {
    getStatus: vi.fn().mockResolvedValue({
      enrolled: true,
      methods: ['totp', 'recovery_code'],
      totp_verified_at: '2026-05-18T11:00:00Z',
      recovery_codes_remaining: 6,
    }),
    startEnrollment: vi.fn().mockResolvedValue({
      secret: 'SECRET',
      qr_uri: 'otpauth://totp/test',
      provisioning_uri: 'otpauth://totp/test',
    }),
  },
}))

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getAuditEvents: vi.fn().mockResolvedValue({
      events: [
        {
          id: 'audit-login',
          event: 'login',
          ip_address: '103.88.12.10',
          user_agent: 'Chrome macOS',
          created_at: '2026-05-20T18:25:00Z',
        },
        {
          id: 'audit-revoked',
          event: 'session_revoked',
          ip_address: '36.82.10.20',
          user_agent: 'Mobile Safari iOS',
          created_at: '2026-05-18T09:18:00Z',
        },
      ],
      total: 2,
    }),
    getProfile: vi.fn().mockResolvedValue({
      profile: { status: 'active' },
      authorization: {
        scope: 'openid profile email offline_access sso.portal',
        roles: ['portal-user'],
        permissions: ['profile.read', 'sessions.revoke', 'mfa.manage'],
      },
      security: {
        session_id: 'current',
        risk_score: 55,
        mfa_required: true,
        last_seen_at: '2026-05-20T18:42:00Z',
      },
    }),
    changePassword: vi.fn().mockResolvedValue({
      message: 'Password berhasil diperbarui.',
      changed_at: '2026-05-20T19:00:00Z',
      other_sessions_revoked: true,
    }),
  },
}))

describe('SecurityPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function mountSecurityPage(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(SecurityPage, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('shows MFA data points and avoids internal design-system jargon in the hero', async () => {
    const wrapper = await mountSecurityPage()

    expect(wrapper.text()).toContain('Kelola MFA')
    expect(wrapper.text()).toContain(
      '6 recovery code tersisa · TOTP aktif · Diverifikasi 18/05/26, 19:00',
    )
    expect(wrapper.text()).toContain(
      'Kelola aplikasi autentikasi dan kode cadangan untuk akun kamu.',
    )
    expect(wrapper.text()).toContain('satu halaman terpusat')
    expect(wrapper.text()).not.toContain('liquid glass')
  })

  it('renders risk score context with gauge, scale, level, and detail CTA', async () => {
    const wrapper = await mountSecurityPage()

    const riskCard = wrapper.find('[data-testid="risk-card"]')
    const riskBar = wrapper.find('[data-testid="risk-score-bar"]')

    expect(riskCard.text()).toContain('55/100')
    expect(riskCard.text()).toContain('Tinggi')
    expect(riskCard.text()).toContain('Lihat Detail Risiko')
    expect(riskBar.attributes('style')).toContain('width: 55%')
    expect(riskBar.classes()).toContain('bg-error-700')
  })

  it('keeps password change as a full-width section with reveal buttons and live strength checklist', async () => {
    const wrapper = await mountSecurityPage()

    const passwordSection = wrapper.find('[data-testid="password-section"]')
    const actionRow = wrapper.find('[data-testid="password-form-actions"]')
    const revealButtons = wrapper.findAll('button[aria-label="Tampilkan password"]')

    expect(passwordSection.exists()).toBe(true)
    expect(actionRow.classes()).toContain('flex-col')
    expect(actionRow.classes()).toContain('sm:flex-row')
    expect(revealButtons).toHaveLength(3)

    const newPasswordInput = wrapper.find('input#new_password')
    await newPasswordInput.setValue('NewSecure456!')
    await revealButtons[1]?.trigger('click')

    expect(newPasswordInput.attributes('type')).toBe('text')
    expect(wrapper.find('[data-testid="password-strength-label"]').text()).toContain('Kuat · 5/5')
    expect(wrapper.text()).toContain('Minimal 12 karakter')
    expect(wrapper.text()).toContain('Karakter spesial')
    expect(wrapper.text()).toContain('* Semua kolom wajib diisi')
  })

  it('renders access scopes as chips with permission context', async () => {
    const wrapper = await mountSecurityPage()

    expect(wrapper.text()).toContain('Peran, izin, dan cakupan akses')
    expect(wrapper.text()).toContain('Cakupan Akses')
    expect(wrapper.text()).toContain('Identitas Dasar')
    expect(wrapper.text()).toContain('openid')
    expect(wrapper.text()).toContain('Akses Offline (Refresh Token)')
    expect(wrapper.text()).toContain('offline_access')
    expect(wrapper.text()).toContain('SSO Portal')
    expect(wrapper.text()).toContain('Belum Diverifikasi')
    expect(wrapper.text()).toContain('Mengakhiri sesi aktif dari perangkat lain')
  })

  it('highlights risky audit events from foreign IPs with readable labels and standard timestamps', async () => {
    const wrapper = await mountSecurityPage()

    const auditRows = wrapper.findAll('[data-testid="audit-event-row"]')
    const riskyRow = auditRows.find((row) => row.text().includes('Sesi Keluar Otomatis'))

    expect(wrapper.text()).toContain('Login Berhasil')
    expect(riskyRow?.text()).toContain('36.82.10.20')
    expect(riskyRow?.text()).toContain('Aktivitas sensitif terdeteksi dari IP yang tidak dikenal')
    expect(riskyRow?.classes().join(' ')).toContain('border-error-700/40')
    expect(wrapper.text()).toContain('21/05/26, 02:25')
    expect(wrapper.text()).not.toContain('session_revoked')
  })

  it('keeps audit event rows safe for narrow mobile widths', async () => {
    const wrapper = await mountSecurityPage()

    const auditList = wrapper.find('[data-testid="audit-events-list"]')
    const auditRowMeta = wrapper.find('[data-testid="audit-event-meta"]')
    const auditEventBadge = wrapper.find('[data-testid="audit-event-badge"]')
    const auditIpAddress = wrapper.find('[data-testid="audit-event-ip-address"]')

    expect(auditList.classes()).toContain('min-w-0')
    expect(auditRowMeta.classes()).toContain('grid')
    expect(auditRowMeta.classes()).toContain('grid-cols-[minmax(0,1fr)_auto]')
    expect(auditEventBadge.classes()).toContain('truncate')
    expect(auditIpAddress.classes()).toContain('whitespace-nowrap')
  })
})
