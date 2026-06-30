// SSR token-leak fixture: a representative MASKED user detail so the §3.3 gate
// can render /users/[subjectId] in its READY state. The single session carries
// the RAW SENTINEL.sid as its id: the detail page renders session ids through
// formatTechnicalPreview (REF-XXXXXXXX), so the raw sid must NEVER appear in the
// HTML or __NUXT_DATA__ — proven by the gate. Government identifiers are masked
// (no 16/18/10-digit run, never the raw NIK/NIP/NISN sentinel).
import { defineEventHandler } from 'h3'
import { SENTINEL } from '../../../../../sentinels'

export default defineEventHandler((event) => {
  const subjectId = (event.context.params?.subjectId as string | undefined) ?? 'sub-target-sentinel'
  return {
    user: {
      id: 4021,
      subject_id: subjectId,
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
    },
    login_context: {
      ip_address: '203.0.113.7',
      mfa_required: false,
      last_seen_at: '2026-06-27T22:41:00Z',
    },
    sessions: [
      {
        // RAW session id on purpose: the page must mask it to REF-4A1B9C0D.
        id: SENTINEL.sid,
        ip_address: '203.0.113.7',
        user_agent: 'Mozilla/5.0',
        last_seen_at: '2026-06-27T22:41:00Z',
        created_at: '2026-06-27T22:00:00Z',
      },
    ],
  }
})
