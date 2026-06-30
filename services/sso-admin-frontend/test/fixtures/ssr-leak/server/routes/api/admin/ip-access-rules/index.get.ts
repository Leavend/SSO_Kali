// SSR token-leak fixture: a representative IP access rule list so the §3.3 gate
// renders the page READY. No token, secret, session id, or PII-shaped digit run —
// CIDR octets are ≤3 digits, ISO timestamps have no 10/16/18-digit run, and the
// actor subject id is an opaque ULID-style string (no long digit run).
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  rules: [
    {
      id: 1,
      cidr: '203.0.113.0/24',
      mode: 'block',
      reason: 'Blocked maintenance range',
      expires_at: null,
      actor_subject_id: 'sub-admin-sentinel',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 2,
      cidr: '198.51.100.0/24',
      mode: 'allow',
      reason: 'Office egress range',
      expires_at: '2027-01-01T00:00:00Z',
      actor_subject_id: 'sub-secops-sentinel',
      created_at: '2026-06-21T09:00:00Z',
      updated_at: '2026-06-21T09:00:00Z',
    },
  ],
}))
