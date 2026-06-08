/**
 * Dev-only portal preview fixtures.
 *
 * Enabled only with `VITE_PORTAL_PREVIEW_BYPASS_AUTH=true` in local dev.
 * Never use this flag in production builds.
 */

import type { SsoUser } from '@/types/auth.types'
import type { AuditListResponse } from '@/types/audit.types'
import type { MfaEnrollmentStatus } from '@/types/mfa.types'
import type {
  ConnectedApp,
  DataSubjectRequestSummary,
  ProfilePortal,
  TrustedDeviceSummary,
  UserSessionSummary,
} from '@/types/profile.types'

export function isPortalPreviewBypassEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_PORTAL_PREVIEW_BYPASS_AUTH === 'true'
}

export const previewUser: SsoUser = {
  id: 1001,
  subject_id: 'sub_preview_user',
  email: 'preview.user@dev-sso.local',
  display_name: 'Bontang Preview User',
  roles: ['portal-user', 'security-reviewer'],
}

export const previewProfile: ProfilePortal = {
  profile: {
    subject_id: previewUser.subject_id,
    display_name: previewUser.display_name,
    given_name: 'Bontang',
    family_name: 'Preview',
    email: previewUser.email,
    email_verified: true,
    status: 'active',
    profile_synced_at: '2026-05-20T16:00:00Z',
    last_login_at: '2026-05-20T18:25:00Z',
  },
  authorization: {
    scope: 'openid profile email offline_access sso.portal',
    roles: previewUser.roles,
    permissions: ['profile.read', 'sessions.revoke', 'mfa.manage'],
  },
  security: {
    session_id: 'sess_preview_current',
    mfa_required: true,
    last_seen_at: '2026-05-20T18:42:00Z',
  },
}

export const previewConnectedApps: readonly ConnectedApp[] = [
  {
    client_id: 'bontang-civic-dashboard',
    display_name: 'Bontang Civic Dashboard',
    first_connected_at: '2026-05-12T08:00:00Z',
    last_used_at: '2026-05-20T17:35:00Z',
    expires_at: '2026-06-20T17:35:00Z',
    active_refresh_tokens: 2,
    scopes: ['profile.read', 'email', 'sessions.revoke', 'offline_access'],
    description: 'Dashboard manajemen data kota Bontang — aplikasi web resmi Pemda.',
    category: 'Web App Internal',
    logo_initials: 'BCD',
  },
  {
    client_id: 'ops-mobile-app',
    display_name: 'Operations Mobile App',
    first_connected_at: '2026-05-10T09:15:00Z',
    last_used_at: '2026-05-19T21:10:00Z',
    expires_at: '2026-06-19T21:10:00Z',
    active_refresh_tokens: 1,
    scopes: ['profile.read', 'email', 'offline_access'],
    description: 'Aplikasi mobile operasional untuk akses lapangan.',
    category: 'Mobile App',
    logo_initials: 'OMA',
  },
]

export const previewSessions: readonly UserSessionSummary[] = [
  {
    session_id: 'sess_preview_current',
    opened_at: '2026-05-20T16:30:00Z',
    last_used_at: '2026-05-20T18:42:00Z',
    expires_at: '2026-05-21T02:42:00Z',
    client_count: 2,
    client_ids: ['sso-frontend-portal', 'bontang-civic-dashboard'],
    client_display_names: ['Dev-SSO Portal', 'Bontang Civic Dashboard'],
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
    is_current: true,
  },
  {
    session_id: 'sess_preview_mobile',
    opened_at: '2026-05-19T07:30:00Z',
    last_used_at: '2026-05-20T10:11:00Z',
    expires_at: '2026-05-20T22:11:00Z',
    client_count: 1,
    client_ids: ['ops-mobile-app'],
    client_display_names: ['Operations Mobile App'],
    user_agent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    is_current: false,
  },
]

export const previewTrustedDevices: readonly TrustedDeviceSummary[] = [
  {
    id: 101,
    label: 'Mac kerja utama',
    fingerprint: '7f2a8c91b633',
    trusted_at: '2026-05-18T10:00:00Z',
    last_seen_at: '2026-05-20T18:42:00Z',
    ip_address: '103.88.12.10',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0',
  },
  {
    id: 102,
    label: null,
    fingerprint: '4db712fa092e',
    trusted_at: '2026-05-16T09:15:00Z',
    last_seen_at: '2026-05-19T21:10:00Z',
    ip_address: '36.82.10.20',
    user_agent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  },
]

export const previewMfaStatus: MfaEnrollmentStatus = {
  enrolled: true,
  methods: ['totp', 'recovery_code'],
  totp_verified_at: '2026-05-18T11:00:00Z',
  recovery_codes_remaining: 7,
}

export const previewAuditEvents: AuditListResponse = {
  total: 4,
  events: [
    {
      id: 'audit-1',
      event: 'login',
      ip_address: '103.88.12.10',
      user_agent: 'Chrome macOS',
      created_at: '2026-05-20T18:25:00Z',
    },
    {
      id: 'audit-2',
      event: 'token_refreshed',
      ip_address: '103.88.12.10',
      user_agent: 'Chrome macOS',
      created_at: '2026-05-20T17:10:00Z',
    },
    {
      id: 'audit-3',
      event: 'profile_updated',
      ip_address: '103.88.12.10',
      user_agent: 'Chrome macOS',
      created_at: '2026-05-19T13:44:00Z',
    },
    {
      id: 'audit-4',
      event: 'session_revoked',
      ip_address: '36.82.10.20',
      user_agent: 'Mobile Safari iOS',
      created_at: '2026-05-18T09:18:00Z',
    },
  ],
}

export const previewDataSubjectRequests: readonly DataSubjectRequestSummary[] = [
  {
    request_id: 'dsr-preview-001',
    type: 'export',
    status: 'submitted',
    reason: 'Audit pribadi akun SSO',
    submitted_at: '2026-05-19T08:00:00Z',
    reviewed_at: null,
    fulfilled_at: null,
    sla_due_at: '2026-06-18T08:00:00Z',
  },
]
