// SSR token-leak fixture: a representative masked authentication-event list so the
// §3.3 gate renders the page READY. Operational fields only — email is the allowed
// display field; ip is dotted; subject_id/session_id/request_id are opaque; context
// is backend-redacted. No token, secret, or PII-shaped digit run (no 10/16/18-digit
// contiguous run). The session_id here is the AUDITED session's handle, distinct
// from the admin's OIDC sid (which the gate keeps strictly absent).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  events: [
    {
      event_id: '01JAUTHEVENTONE',
      event_type: 'user.login',
      outcome: 'failed',
      subject: { subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N', email: 'operator@dev-sso.local' },
      client_id: 'portal',
      session_id: 'sess_audit_handle_01',
      request: {
        ip_address: '203.0.113.42',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        request_id: 'req_audit_01',
      },
      error_code: 'invalid_credentials',
      context: { mfa: 'totp', authorization: '[redacted]' },
      occurred_at: '2026-06-28T14:32:15+00:00',
    },
    {
      event_id: '01JAUTHEVENTTWO',
      event_type: 'user.consent',
      outcome: 'succeeded',
      subject: { subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P', email: 'analyst@dev-sso.local' },
      client_id: 'console',
      session_id: 'sess_audit_handle_02',
      request: {
        ip_address: '198.51.100.7',
        user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
        request_id: 'req_audit_02',
      },
      error_code: null,
      context: {},
      occurred_at: '2026-06-28T15:00:00+00:00',
    },
  ],
  pagination: { per_page: 50, next_cursor: null, previous_cursor: null, has_more: false },
}))
