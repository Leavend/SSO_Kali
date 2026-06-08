import { describe, expect, it } from 'vitest'
import {
  auditEventLabel,
  formatPortalDateTime,
  knownLoginIpAddresses,
  oauthScopeTokens,
  presentAuditEvent,
  presentMfaSummary,
} from '@/lib/portal-security'
import type { AuditEvent } from '@/types/audit.types'

const auditEvents: readonly AuditEvent[] = [
  {
    id: 'login-1',
    event: 'login',
    ip_address: '103.88.12.10',
    user_agent: 'Chrome macOS',
    created_at: '2026-05-20T18:25:00Z',
  },
  {
    id: 'revoked-1',
    event: 'session_revoked',
    ip_address: '36.82.10.20',
    user_agent: 'Mobile Safari iOS',
    created_at: '2026-05-18T09:18:00Z',
  },
]

describe('portal-security presenters', () => {
  it('highlights sensitive audit events from unfamiliar IP addresses', () => {
    const knownIps = knownLoginIpAddresses(auditEvents)
    const riskyEvent = auditEvents[1]

    if (!riskyEvent) throw new Error('Missing risky event fixture.')

    expect(knownIps.has('103.88.12.10')).toBe(true)
    expect(presentAuditEvent(riskyEvent, knownIps)).toMatchObject({
      label: 'Sesi Keluar Otomatis',
      severity: 'critical',
      helper: 'Aktivitas sensitif terdeteksi dari IP yang tidak dikenal.',
      rowClass: 'border-error-700/40 bg-error-50 text-error-800 dark:border-error-700/50 dark:bg-error-950/30 dark:text-error-200',
      badgeClass: 'border-error-700/30 bg-error-50 text-error-800 dark:border-error-700/50 dark:bg-error-950/40 dark:text-error-200',
      iconClass: 'text-error-700 dark:text-error-300',
    })
  })

  it('formats technical names, access scopes, and timestamps for users', () => {
    expect(auditEventLabel('token_refreshed')).toBe('Token Diperbarui')
    expect(auditEventLabel('login', { outcome: 'failed' })).toBe('Login Gagal')
    expect(oauthScopeTokens('openid profile  offline_access')).toEqual([
      'openid',
      'profile',
      'offline_access',
    ])
    expect(formatPortalDateTime('2026-05-20T18:25:00Z')).toContain('20 Mei 2026')
  })

  it('summarizes MFA recovery, authenticator method, and last verification', () => {
    expect(
      presentMfaSummary(
        {
          enrolled: true,
          methods: ['totp', 'recovery_code'],
          totp_verified_at: '2026-05-18T11:00:00Z',
          recovery_codes_remaining: 6,
        },
        true,
      ),
    ).toContain('6 recovery code tersisa · TOTP aktif · Diverifikasi')
  })
})
