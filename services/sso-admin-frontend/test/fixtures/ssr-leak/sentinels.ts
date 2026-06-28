// Shared sentinels for the §3.3 SSR token-leak render gate (Task 2c.1).
// Imported by the fixture session-injection middleware, the fixture principal
// route, and the gate test so the INJECTED values and the ASSERTED values can
// never drift apart (DRY). These are deliberately distinctive, non-secret
// placeholders — their only job is to be detectable if they ever leak.

// Private runtimeConfig canary (mirrors the Task 0.4 seed value). Lives in the
// PRIVATE half of runtimeConfig; it must never reach SSR HTML / the payload.
export const SSR_LEAK_CANARY = 'leak-canary-do-not-render' as const

export const SENTINEL = {
  // OIDC token VALUES — must live only in Nitro event.context, never serialized.
  access: 'SENTINEL-ACCESS-TOKEN-3f9a2c7d1e',
  refresh: 'SENTINEL-REFRESH-TOKEN-8b1d6e0a4c',
  id: 'SENTINEL-ID-TOKEN-5c2f9a8b3d',
  sid: 'SENTINEL-SID-7e4a1b9c0d',
  // Plaintext client secret VALUE — exists only on a client-side create/rotate POST
  // response, NEVER on event.context and NEVER in a list/detail DTO. The gate proves
  // it never reaches SSR HTML / the payload (regression tripwire).
  clientSecret: 'SENTINEL-CLIENT-SECRET-2a7f4b1e9c',
  // Raw government PII VALUES, shaped EXACTLY like real identifiers.
  nik: '3174091987654321', // 16 digits (NIK)
  nip: '198509152023011007', // 18 digits (NIP)
  nisn: '0098123456', // 10 digits (NISN)
} as const
