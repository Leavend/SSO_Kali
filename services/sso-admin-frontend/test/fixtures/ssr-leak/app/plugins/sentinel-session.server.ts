import { defineNuxtPlugin, useRequestEvent } from '#imports'
import type { PortalSession } from '../../../../../server/utils/session'
import { SENTINEL } from '../../sentinels'

// Server-only Nuxt plugin that injects an authenticated sentinel session onto the
// SSR request's event.context BEFORE the route guard + page render. It runs inside
// the render handler, i.e. AFTER all Nitro middleware (including the real
// server/middleware/session.ts), so it deterministically wins regardless of
// middleware ordering — simulating a genuinely signed-in admin without a live IdP.
//
// This object is the SERVER-ONLY custody surface: its OIDC tokens (access/refresh/
// id/sid) and raw government PII (NIK/NIP/NISN) must never reach the SSR HTML or
// the __NUXT_DATA__ hydration payload. The gate proves the safe dashboard keeps
// them here even though they are present on the server during the render.
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  if (!event) return

  event.context.session = {
    accessToken: SENTINEL.access,
    idToken: SENTINEL.id,
    refreshToken: SENTINEL.refresh,
    sub: 'sub-admin-sentinel',
    sid: SENTINEL.sid,
    subject: 'sub-admin-sentinel',
    email: 'admin@example.test',
    displayName: 'Admin Sentinel',
    role: 'admin',
    expiresAt: 4_102_444_800,
    authTime: null,
    amr: ['pwd'],
    acr: null,
    lastLoginAt: null,
    issuedAt: 1,
    absoluteExpiresAt: 4_102_444_800,
    lastRefreshedAt: 1,
    // Raw government PII present on the server session; masked before any client view.
    nik: SENTINEL.nik,
    nip: SENTINEL.nip,
    nisn: SENTINEL.nisn,
  } satisfies PortalSession & { nik: string; nip: string; nisn: string }
})
