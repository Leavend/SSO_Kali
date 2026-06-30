// SSR token-leak fixture: a representative masked policy list so the §3.3 gate
// renders the Policy page in READY (an active + a superseded + a draft version) and
// the payload collectors cover the SecurityPolicy DTO. Non-secret config payloads,
// ULID actor ids (no 10/16/18-digit run), audit reasons — no token, secret, session
// id, or PII-shaped digit run. A future effective_at is metadata only.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({
  category: 'password',
  active: { min_length: 14, require_special: true },
  policies: [
    {
      id: 3,
      category: 'password',
      version: 3,
      status: 'active',
      payload: { min_length: 14, require_special: true },
      effective_at: '2026-06-20T10:00:00Z',
      activated_at: '2026-06-20T10:00:00Z',
      superseded_at: null,
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N',
      reason: 'Tighten the password baseline.',
      created_at: '2026-06-20T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 2,
      category: 'password',
      version: 2,
      status: 'superseded',
      payload: { min_length: 12, require_special: false },
      effective_at: '2026-05-01T10:00:00Z',
      activated_at: '2026-05-01T10:00:00Z',
      superseded_at: '2026-06-20T10:00:00Z',
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K8P',
      reason: 'Initial baseline.',
      created_at: '2026-05-01T10:00:00Z',
      updated_at: '2026-06-20T10:00:00Z',
    },
    {
      id: 4,
      category: 'password',
      version: 4,
      status: 'draft',
      payload: { min_length: 16, require_special: true },
      effective_at: null,
      activated_at: null,
      superseded_at: null,
      actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q',
      reason: 'Proposed stronger baseline.',
      created_at: '2026-06-28T10:00:00Z',
      updated_at: '2026-06-28T10:00:00Z',
    },
  ],
}))
