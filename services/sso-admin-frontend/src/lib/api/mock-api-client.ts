export type MockResponse = {
  status: number
  data: any
}

// Stateful mock store
const clients = [
  {
    client_id: 'portal-app',
    display_name: 'SSO Portal App',
    type: 'confidential',
    environment: 'live',
    app_base_url: 'https://sso.leavend.com',
    redirect_uris: ['https://sso.leavend.com/auth/callback'],
    post_logout_redirect_uris: ['https://sso.leavend.com/auth/logout/callback'],
    allowed_scopes: ['openid', 'profile', 'email'],
    owner_email: 'portal-ops@leavend.com',
    provisioning: 'jit',
    status: 'active',
    activated_at: '2026-01-01T00:00:00Z',
    has_secret_hash: true,
  },
  {
    client_id: 'slack-integration',
    display_name: 'Slack Notification Sync',
    type: 'confidential',
    environment: 'development',
    app_base_url: 'http://localhost:8000',
    redirect_uris: ['http://localhost:8000/slack/oauth'],
    post_logout_redirect_uris: [],
    allowed_scopes: ['openid', 'profile'],
    owner_email: 'slack-dev@leavend.com',
    provisioning: 'jit',
    status: 'active',
    activated_at: '2026-03-15T08:30:00Z',
    has_secret_hash: true,
  },
  {
    client_id: 'public-mobile-app',
    display_name: 'SSO Android/iOS App',
    type: 'public',
    environment: 'live',
    app_base_url: 'sso-mobile://app',
    redirect_uris: ['sso-mobile://app/callback'],
    post_logout_redirect_uris: [],
    allowed_scopes: ['openid', 'profile', 'offline_access'],
    owner_email: 'mobile-team@leavend.com',
    provisioning: 'jit',
    status: 'active',
    activated_at: '2026-04-10T12:00:00Z',
    has_secret_hash: false,
  },
]

const users = [
  {
    id: 1,
    subject_id: 'usr_01jk98as7a98',
    email: 'admin@leavend.com',
    display_name: 'Super Admin',
    roles: ['super-admin'],
    status: 'active',
    created_at: '2025-12-01T10:00:00Z',
  },
  {
    id: 2,
    subject_id: 'usr_01jk98as7a99',
    email: 'operator@leavend.com',
    display_name: 'Operations Manager',
    roles: ['operator'],
    status: 'active',
    created_at: '2026-01-10T14:30:00Z',
  },
  {
    id: 3,
    subject_id: 'usr_01jk98as7b00',
    email: 'auditor@leavend.com',
    display_name: 'External Auditor',
    roles: ['auditor'],
    status: 'active',
    created_at: '2026-02-05T09:15:00Z',
  },
]

const sessions = [
  {
    session_id: 'sess_admin_01',
    subject_id: 'usr_01jk98as7a98',
    email: 'admin@leavend.com',
    ip_address: '127.0.0.1',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    authenticated_at: new Date().toISOString(),
  },
  {
    session_id: 'sess_admin_02',
    subject_id: 'usr_01jk98as7a99',
    email: 'operator@leavend.com',
    ip_address: '192.168.1.50',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 82800000).toISOString(),
    authenticated_at: new Date(Date.now() - 3600000).toISOString(),
  },
]

const roles = [
  {
    id: 'super-admin',
    name: 'Super Administrator',
    description: 'Full capabilities across all OIDC configurations, policies, and audits.',
    permissions: [
      'admin.dashboard.view',
      'admin.clients.read',
      'admin.clients.write',
      'admin.users.read',
      'admin.users.write',
      'admin.audit.read',
      'admin.observability.read',
      'admin.sessions.terminate',
      'admin.security-policy.read',
      'admin.security-policy.write',
      'admin.roles.read',
      'admin.roles.write',
      'admin.authentication-audit.read',
      'profile.read',
      'profile.write',
    ],
  },
  {
    id: 'operator',
    name: 'Platform Operator',
    description: 'Manage clients and users, with audit log viewing capabilities.',
    permissions: [
      'admin.dashboard.view',
      'admin.clients.read',
      'admin.clients.write',
      'admin.users.read',
      'admin.users.write',
      'admin.audit.read',
      'admin.observability.read',
      'profile.read',
    ],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to audit logs and authentication details.',
    permissions: [
      'admin.dashboard.view',
      'admin.audit.read',
      'admin.observability.read',
      'admin.authentication-audit.read',
      'profile.read',
    ],
  },
]

const permissions = [
  { id: 'admin.dashboard.view', label: 'View Admin Dashboard', category: 'Dashboard' },
  { id: 'admin.clients.read', label: 'Read OIDC Clients', category: 'Clients' },
  { id: 'admin.clients.write', label: 'Write OIDC Clients', category: 'Clients' },
  { id: 'admin.users.read', label: 'Read Users', category: 'Users' },
  { id: 'admin.users.write', label: 'Write Users', category: 'Users' },
  { id: 'admin.audit.read', label: 'Read System Audits', category: 'Audit' },
  { id: 'admin.observability.read', label: 'Read Observability', category: 'Audit' },
  { id: 'admin.sessions.terminate', label: 'Terminate Sessions', category: 'Sessions' },
  { id: 'admin.security-policy.read', label: 'Read Security Policies', category: 'Policies' },
  { id: 'admin.security-policy.write', label: 'Write Security Policies', category: 'Policies' },
  { id: 'admin.roles.read', label: 'Read Roles & Permissions', category: 'Roles' },
  { id: 'admin.roles.write', label: 'Write Roles & Permissions', category: 'Roles' },
  { id: 'admin.authentication-audit.read', label: 'Read Authentication Audit', category: 'Audit' },
  { id: 'profile.read', label: 'Read Personal Profile', category: 'Profile' },
  { id: 'profile.write', label: 'Write Personal Profile', category: 'Profile' },
]

const ipRules = [
  {
    id: 'rule_01',
    type: 'allow',
    cidr: '127.0.0.1/32',
    description: 'Localhost fallback loopback',
  },
  {
    id: 'rule_02',
    type: 'allow',
    cidr: '192.168.1.0/24',
    description: 'Corporate Office VPN Range',
  },
  {
    id: 'rule_03',
    type: 'deny',
    cidr: '203.0.113.0/24',
    description: 'Known malicious scanner range',
  },
]

const ssoTemplates = [
  {
    id: 'tpl_default',
    name: 'Standard SSO Login Template',
    theme: 'dark-first',
    footer_text: '© 2026 Leavend SSO Platform',
  },
  {
    id: 'tpl_corporate',
    name: 'Partner Corporate SSO Landing',
    theme: 'glassmorphism',
    footer_text: 'Protected by Enterprise MFA',
  },
]

const securityPolicies: Record<string, any> = {
  password: {
    min_length: 12,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_symbols: true,
    max_age_days: 90,
  },
  session: {
    idle_timeout_minutes: 15,
    absolute_timeout_hours: 24,
    concurrent_sessions_limit: 3,
  },
  lockout: {
    max_failed_attempts: 5,
    lockout_duration_minutes: 30,
    reset_attempts_after_minutes: 10,
  },
}

const auditEvents = [
  {
    id: 'AUD01',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    actor: 'admin@leavend.com',
    action: 'client.secret_rotated',
    target: 'Slack Notification Sync',
    status: 'success',
  },
  {
    id: 'AUD02',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    actor: 'admin@leavend.com',
    action: 'security_policy.password.update',
    target: 'Password Policy',
    status: 'success',
  },
  {
    id: 'AUD03',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    actor: 'operator@leavend.com',
    action: 'client.disabled',
    target: 'SSO Android/iOS App',
    status: 'success',
  },
]

const authAuditEvents = [
  {
    id: 'AUTH01',
    timestamp: new Date(Date.now() - 50000).toISOString(),
    user: 'admin@leavend.com',
    event: 'login.success',
    ip_address: '127.0.0.1',
    location: 'Jakarta, ID',
    details: 'Password + App TOTP verified.',
  },
  {
    id: 'AUTH02',
    timestamp: new Date(Date.now() - 150000).toISOString(),
    user: 'operator@leavend.com',
    event: 'mfa.challenge.failed',
    ip_address: '192.168.1.50',
    location: 'Bandung, ID',
    details: 'Incorrect OTP code entered.',
  },
  {
    id: 'AUTH03',
    timestamp: new Date(Date.now() - 250000).toISOString(),
    user: 'external_partner',
    event: 'login.failed',
    ip_address: '203.0.113.44',
    location: 'London, UK',
    details: 'User not found.',
  },
]

export function handleMockRequest(method: string, path: string, body?: any): MockResponse {
  // Normalize path query params
  const cleanPath = path.split('?')[0] ?? ''

  // 1. Session & authentication
  if (cleanPath === '/api/auth/session') {
    return {
      status: 200,
      data: {
        authenticated: true,
        user: {
          id: 1,
          subject_id: 'usr_01jk98as7a98',
          email: 'admin@leavend.com',
          display_name: 'Super Admin',
          roles: ['admin'],
        },
      },
    }
  }

  if (cleanPath === '/api/admin/me') {
    return {
      status: 200,
      data: {
        principal: {
          subject_id: 'usr_01jk98as7a98',
          email: 'admin@leavend.com',
          display_name: 'Super Admin',
          role: 'admin',
          last_login_at: '2026-06-04T02:00:00Z',
          auth_context: {
            auth_time: '2026-06-04T02:00:00Z',
            amr: ['pwd', 'mfa'],
            acr: 'urn:mace:incommon:iap:silver',
            mfa_enforced: true,
            mfa_verified: true,
          },
          permissions: {
            view_admin_panel: true,
            manage_sessions: true,
            permissions: roles[0]?.permissions ?? [],
            capabilities: roles[0]?.permissions.reduce<Record<string, boolean>>((acc, perm) => {
              acc[perm] = true
              return acc
            }, {}),
            menus: [
              {
                id: 'dashboard',
                label: 'Dashboard',
                required_permission: 'admin.dashboard.view',
                visible: true,
              },
              {
                id: 'oidc-foundation',
                label: 'OIDC Foundation',
                required_permission: 'admin.dashboard.view',
                visible: true,
              },
              {
                id: 'clients',
                label: 'Clients',
                required_permission: 'admin.clients.read',
                visible: true,
              },
              {
                id: 'users',
                label: 'Users',
                required_permission: 'admin.users.read',
                visible: true,
              },
              {
                id: 'audit',
                label: 'Observability',
                required_permission: 'admin.observability.read',
                visible: true,
              },
              {
                id: 'sessions',
                label: 'Sessions',
                required_permission: 'admin.sessions.terminate',
                visible: true,
              },
              {
                id: 'policy',
                label: 'Policies',
                required_permission: 'admin.security-policy.read',
                visible: true,
              },
              {
                id: 'roles',
                label: 'Roles',
                required_permission: 'admin.roles.read',
                visible: true,
              },
              {
                id: 'authentication-audit',
                label: 'Auth Audit',
                required_permission: 'admin.authentication-audit.read',
                visible: true,
              },
              {
                id: 'profile',
                label: 'Profile',
                required_permission: 'profile.read',
                visible: true,
              },
            ],
          },
        },
      },
    }
  }

  // 2. Dashboard
  if (cleanPath === '/api/admin/dashboard/summary') {
    return {
      status: 200,
      data: {
        generated_at: new Date().toISOString(),
        counters: {
          users: { total: users.length, active: users.length, locked: 0 },
          sessions: { total: sessions.length, active: sessions.length },
          clients: { total: clients.length, active: clients.length, disabled: 0 },
          audit: { events: auditEvents.length, authentication: authAuditEvents.length },
          incidents: { unresolved: 0, total: 0 },
          data_subject_requests: { pending: 0 },
        },
      },
    }
  }

  // 3. Clients
  if (cleanPath === '/api/admin/clients') {
    return { status: 200, data: { clients } }
  }
  if (cleanPath === '/api/admin/client-integrations/registrations') {
    return { status: 200, data: { registrations: clients } }
  }
  if (cleanPath.startsWith('/api/admin/clients/')) {
    const clientId = cleanPath.split('/').pop()
    const client = clients.find((c) => c.client_id === clientId)
    if (client) return { status: 200, data: { client } }
    return { status: 404, data: { message: 'Client not found.' } }
  }
  if (cleanPath === '/api/admin/client-integrations/stage') {
    const newClient = {
      client_id: body.client_id || `client-${Math.random().toString(36).slice(2, 8)}`,
      display_name: body.app_name || 'New Client Application',
      type: body.client_type || 'confidential',
      environment: body.environment || 'development',
      app_base_url: body.app_base_url || '',
      redirect_uris: [body.app_base_url + (body.callback_path || '')],
      post_logout_redirect_uris: [body.app_base_url + (body.logout_path || '')],
      allowed_scopes: ['openid', 'profile'],
      owner_email: body.owner_email || 'owner@leavend.com',
      provisioning: body.provisioning || 'jit',
      status: 'active',
      activated_at: new Date().toISOString(),
      has_secret_hash: body.client_type === 'confidential',
    }
    clients.push(newClient)
    return { status: 201, data: { registration: newClient } }
  }

  // 4. Users
  if (cleanPath === '/api/admin/users') {
    return { status: 200, data: { users } }
  }
  if (cleanPath.startsWith('/api/admin/users/')) {
    const subId = cleanPath.split('/').pop()
    const user = users.find((u) => u.subject_id === subId)
    if (user) return { status: 200, data: { user } }
    return { status: 404, data: { message: 'User not found.' } }
  }

  // 5. Roles & Permissions
  if (cleanPath === '/api/admin/roles') {
    return { status: 200, data: { roles } }
  }
  if (cleanPath === '/api/admin/permissions') {
    return { status: 200, data: { permissions } }
  }

  // 6. Sessions
  if (cleanPath === '/api/admin/sessions') {
    return { status: 200, data: { sessions } }
  }
  if (cleanPath.startsWith('/api/admin/sessions/')) {
    const sessId = cleanPath.split('/').pop()
    if (method === 'DELETE') {
      const idx = sessions.findIndex((s) => s.session_id === sessId)
      if (idx !== -1) sessions.splice(idx, 1)
      return { status: 200, data: { success: true } }
    }
    const session = sessions.find((s) => s.session_id === sessId)
    if (session) return { status: 200, data: session }
    return { status: 404, data: { message: 'Session not found.' } }
  }

  // 7. Security Policies
  if (cleanPath.startsWith('/api/admin/security-policies/')) {
    const category = cleanPath.split('/').pop() || 'password'
    return { status: 200, data: securityPolicies[category] || {} }
  }

  // 8. IP Access
  if (cleanPath === '/api/admin/ip-access-rules') {
    return { status: 200, data: { rules: ipRules } }
  }

  // 9. SSO Error Templates
  if (cleanPath === '/api/admin/sso-error-templates') {
    return { status: 200, data: { templates: ssoTemplates } }
  }

  // 10. Operations readiness
  if (cleanPath === '/api/admin/ops/readiness') {
    return {
      status: 200,
      data: { service: 'sso-backend', ready: true, checks: { db: 'ok', cache: 'ok' } },
    }
  }

  if (cleanPath === '/api/admin/observability/summary') {
    return {
      status: 200,
      data: {
        generated_at: new Date().toISOString(),
        partial: false,
        degraded: [],
        services: [
          {
            key: 'sso-backend',
            name: 'SSO-Backend',
            status: 'healthy',
            summary: 'Database and Redis readiness checks passed.',
            latency_p95_ms: null,
            request_rate_per_min: 2.4,
            error_rate_percent: 1.2,
            freshness_seconds: 15,
            checks: { database: true, redis: true },
            queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
          },
          {
            key: 'sso-portal',
            name: 'SSO-Portal',
            status: 'unknown',
            summary: 'Portal telemetry aggregator is not wired yet.',
            latency_p95_ms: null,
            request_rate_per_min: 2.4,
            error_rate_percent: 1.2,
            freshness_seconds: null,
            checks: {},
          },
          {
            key: 'admin-sso',
            name: 'Admin-SSO',
            status: 'healthy',
            summary: 'Admin BFF path is reachable.',
            latency_p95_ms: null,
            request_rate_per_min: 1.1,
            error_rate_percent: 0,
            freshness_seconds: 15,
            checks: { api: true },
          },
        ],
        metrics: {
          window_seconds: 900,
          queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
          performance: {},
          auth_funnel: { total_15m: 12, succeeded_15m: 11, failed_15m: 1, failure_rate_percent: 8.33 },
          admin_activity: { total_15m: 4, denied_15m: 0, denied_rate_percent: 0 },
        },
        logs: [
          {
            id: '01MOCKOBSLOG',
            service: 'admin-sso',
            severity: 'info',
            message: 'admin_api',
            reference: 'REF-OBSLOG01',
            occurred_at: new Date().toISOString(),
          },
        ],
        traces: {
          status: 'unavailable',
          reason: 'Distributed tracing is not instrumented yet for admin BFF, portal BFF, and sso-backend.',
          next_step: 'Propagate traceparent and export spans to OpenTelemetry Collector/Tempo.',
          last_seen_trace_id: null,
        },
      },
    }
  }

  // 11. Audit logs
  if (cleanPath === '/api/admin/audit/events') {
    return { status: 200, data: { events: auditEvents } }
  }
  if (cleanPath === '/api/admin/audit/authentication-events') {
    return { status: 200, data: { events: authAuditEvents } }
  }

  // Fallback
  return {
    status: 200,
    data: { ok: true },
  }
}
