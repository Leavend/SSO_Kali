// SSR token-leak fixture: a representative masked active-session list so the §3.3 gate
// renders the Sessions page READY. Operational metadata only — opaque session_id
// HANDLE + ULID subject id + email + IP + clean user-agent + timestamps. No token,
// secret, session cookie value, or PII-shaped digit run (IPs are dotted, no 10/16/18-
// digit run; the session_id handle is exempted via allowSessionId).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  sessions: [
    {
      session_id: 'sess_sentinel_handle_01',
      client_id: 'portal',
      subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
      email: 'sentinel.operator@dev-sso.local',
      display_name: 'Sentinel Operator',
      scope: 'openid profile',
      ip_address: '203.0.113.45',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      created_at: '2026-06-20T10:00:00Z',
      last_activity_at: '2026-06-28T09:15:00Z',
      expires_at: '2026-07-20T10:00:00Z',
    },
    {
      session_id: 'sess_console_handle_02',
      client_id: 'console',
      subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P',
      email: 'analyst@dev-sso.local',
      display_name: 'Analyst Two',
      scope: 'openid',
      ip_address: '198.51.100.7',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
      created_at: '2026-06-21T11:00:00Z',
      last_activity_at: '2026-06-28T08:00:00Z',
      expires_at: '2026-07-21T11:00:00Z',
    },
  ],
}))
