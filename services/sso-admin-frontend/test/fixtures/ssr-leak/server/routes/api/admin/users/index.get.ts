// SSR token-leak fixture: a representative MASKED user list so the §3.3 gate can
// render /users in its READY state and the payload collectors cover the masked
// AdminUserListItem DTO. Government identifiers are the backend-masked form
// (GovernmentIdentifier): the longest digit run is < 10, so collectPiiShapeLeaks
// stays clean, and they are NOT the raw 16/18/10-digit SENTINEL values. A
// more-specific route wins over the layer's catch-all server/routes/api/admin/[...].ts.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  users: [
    {
      id: 4021,
      subject_id: 'sub-target-sentinel',
      email: 'target.user@example.test',
      given_name: 'Target',
      family_name: 'User',
      display_name: 'Target User',
      role: 'user',
      status: 'active',
      effective_status: 'active',
      disabled_at: null,
      disabled_reason: null,
      locked_at: null,
      locked_until: null,
      locked_reason: null,
      locked_by_subject_id: null,
      lock_count: 0,
      local_account_enabled: true,
      profile_synced_at: '2026-06-20T09:15:00Z',
      email_verified_at: '2026-06-19T08:00:00Z',
      last_login_at: '2026-06-27T22:40:00Z',
      created_at: '2026-01-04T03:30:00Z',
      nik: '3174********4321',
      nip: '1985**********1007',
      nisn: '0098****56',
      birth_date: '1987-**-**',
      mfa_enrolled: true,
      mfa_methods: ['totp'],
      mfa_mandatory: false,
      roles: [{ slug: 'user', name: 'User', is_system: true }],
      login_context: {
        ip_address: '203.0.113.7',
        mfa_required: false,
        last_seen_at: '2026-06-27T22:41:00Z',
      },
    },
  ],
}))
