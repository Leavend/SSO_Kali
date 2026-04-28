export type ClientEnvironment = 'live' | 'development'

export type ClientType = 'public' | 'confidential'

export type ProvisioningMode = 'jit' | 'scim'

export type ClientIntegrationDraft = Readonly<{
  appName: string
  clientId: string
  environment: ClientEnvironment
  clientType: ClientType
  appBaseUrl: string
  callbackPath: string
  logoutPath: string
  ownerEmail: string
  provisioning: ProvisioningMode
}>

export type ClientIntegrationContract = Readonly<{
  clientId: string
  displayName: string
  redirectUri: string
  backchannelLogoutUri: string
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
  scopes: readonly string[]
  env: readonly string[]
  registryPatch: readonly string[]
  provisioningSteps: readonly string[]
  rolloutSteps: readonly string[]
  rollbackSteps: readonly string[]
  findings: readonly string[]
}>

export type ClientIntegrationRegistration = Readonly<{
  client_id: string
  display_name: string
  type: ClientType
  environment: ClientEnvironment
  app_base_url: string
  redirect_uris: readonly string[]
  post_logout_redirect_uris: readonly string[]
  backchannel_logout_uri: string | null
  owner_email: string
  provisioning: ProvisioningMode
  status: 'staged' | 'active' | 'disabled'
  activated_at: string | null
  disabled_at: string | null
  has_secret_hash: boolean
}>

type ClientUris = Readonly<{
  redirectUri: string
  backchannelLogoutUri: string
}>

const issuer = 'https://dev-sso.timeh.my.id'

export function defaultIntegrationDraft(): ClientIntegrationDraft {
  return {
    appName: 'Customer Portal',
    clientId: 'customer-portal',
    environment: 'development',
    clientType: 'public',
    appBaseUrl: 'https://customer-dev.timeh.my.id',
    callbackPath: '/auth/callback',
    logoutPath: '/auth/backchannel/logout',
    ownerEmail: 'owner@company.com',
    provisioning: 'jit',
  }
}

export function suggestClientId(appName: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return slug.replace(/^-+|-+$/g, '').slice(0, 48) || 'new-client-app'
}

export function validateClientIntegrationDraft(draft: ClientIntegrationDraft): readonly string[] {
  return [
    ...requiredFieldErrors(draft),
    ...clientIdErrors(draft.clientId),
    ...baseUrlErrors(draft.appBaseUrl, draft.environment),
    ...pathErrors(draft.callbackPath, 'Callback path'),
    ...pathErrors(draft.logoutPath, 'Logout path'),
    ...ownerEmailErrors(draft.ownerEmail),
  ]
}

export function createClientIntegrationContract(draft: ClientIntegrationDraft): ClientIntegrationContract {
  const uris = clientUris(draft)

  return {
    clientId: draft.clientId,
    displayName: draft.appName,
    redirectUri: uris.redirectUri,
    backchannelLogoutUri: uris.backchannelLogoutUri,
    authorizeUrl: `${issuer}/authorize`,
    tokenUrl: `${issuer}/token`,
    userinfoUrl: `${issuer}/userinfo`,
    scopes: scopesFor(draft),
    env: envLines(draft, uris),
    registryPatch: registryPatchLines(draft, uris),
    provisioningSteps: provisioningSteps(draft),
    rolloutSteps: rolloutSteps(draft),
    rollbackSteps: rollbackSteps(draft),
    findings: complianceFindings(draft),
  }
}

function requiredFieldErrors(draft: ClientIntegrationDraft): readonly string[] {
  const labels: readonly [keyof ClientIntegrationDraft, string][] = [
    ['appName', 'Nama aplikasi'],
    ['clientId', 'Client ID'],
    ['appBaseUrl', 'Base URL'],
    ['ownerEmail', 'Owner email'],
  ]
  return labels.filter(([field]) => !draft[field].trim()).map(([, label]) => `${label} wajib diisi.`)
}

function clientIdErrors(clientId: string): readonly string[] {
  if (!clientId) return []
  return /^[a-z0-9][a-z0-9-]{2,62}$/.test(clientId) ? [] : ['Client ID harus slug 3-63 karakter.']
}

function baseUrlErrors(input: string, environment: ClientEnvironment): readonly string[] {
  const parsed = parseUrl(input)
  if (!parsed) return ['Base URL harus URL valid.']
  if (parsed.href.includes('*')) return ['Base URL tidak boleh wildcard.']
  if (parsed.protocol === 'https:') return []
  return environment === 'development' && isLocalhost(parsed) ? [] : ['Live client wajib memakai HTTPS.']
}

function pathErrors(path: string, label: string): readonly string[] {
  if (!path.startsWith('/')) return [`${label} harus diawali /.`]
  return path.includes('*') ? [`${label} tidak boleh wildcard.`] : []
}

function ownerEmailErrors(email: string): readonly string[] {
  if (!email) return []
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [] : ['Owner email harus valid.']
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function isLocalhost(url: URL): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
}

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/g, '')
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function clientUris(draft: ClientIntegrationDraft): ClientUris {
  const baseUrl = normalizeBaseUrl(draft.appBaseUrl)
  return {
    redirectUri: buildUrl(baseUrl, draft.callbackPath),
    backchannelLogoutUri: buildUrl(baseUrl, draft.logoutPath),
  }
}

function scopesFor(draft: ClientIntegrationDraft): readonly string[] {
  return draft.clientType === 'public'
    ? ['openid', 'profile', 'email', 'offline_access']
    : ['openid', 'profile', 'email', 'offline_access', 'sso:session.register']
}

function envLines(draft: ClientIntegrationDraft, uris: ClientUris): readonly string[] {
  const lines = [
    `SSO_ISSUER=${issuer}`,
    `SSO_CLIENT_ID=${draft.clientId}`,
    `SSO_REDIRECT_URI=${uris.redirectUri}`,
    `SSO_BACKCHANNEL_LOGOUT_URI=${uris.backchannelLogoutUri}`,
  ]
  return draft.clientType === 'confidential' ? [...lines, 'SSO_CLIENT_SECRET=<store-in-vault>'] : lines
}

function registryPatchLines(draft: ClientIntegrationDraft, uris: ClientUris): readonly string[] {
  const base = [
    `'${draft.clientId}' => [`,
    `  'type' => '${draft.clientType}',`,
    `  'redirect_uris' => ['${uris.redirectUri}'],`,
    `  'post_logout_redirect_uris' => ['${normalizeBaseUrl(draft.appBaseUrl)}'],`,
    `  'backchannel_logout_uri' => '${uris.backchannelLogoutUri}',`,
  ]
  return draft.clientType === 'confidential' ? [...base, `  'secret' => env('${secretEnvName(draft.clientId)}'),`, '],'] : [...base, '],']
}

function secretEnvName(clientId: string): string {
  return `${clientId.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET_HASH`
}

function provisioningSteps(draft: ClientIntegrationDraft): readonly string[] {
  return draft.provisioning === 'scim' ? scimSteps() : jitSteps()
}

function jitSteps(): readonly string[] {
  return ['Create local profile on first login.', 'Map sub, email, name, role, sid.', 'Deactivate from SSO session revoke.']
}

function scimSteps(): readonly string[] {
  return ['Create SCIM service token in vault.', 'Sync Users and Groups.', 'Handle deactivate before local login.']
}

function rolloutSteps(draft: ClientIntegrationDraft): readonly string[] {
  const first = draft.environment === 'live' ? 'Route 5% admin/tester traffic to SSO.' : 'Use isolated dev redirect URI.'
  return [first, 'Verify callback, refresh rotation, and back-channel logout.', 'Promote only after health and audit checks pass.']
}

function rollbackSteps(draft: ClientIntegrationDraft): readonly string[] {
  const first = draft.environment === 'live' ? 'Disable SSO client toggle.' : 'Delete dev client registration.'
  return [first, 'Restore previous auth route.', 'Revoke issued sessions for this client_id.']
}

function complianceFindings(draft: ClientIntegrationDraft): readonly string[] {
  return [
    'No wildcard redirect URI.',
    'Token storage must use HttpOnly Secure cookie.',
    draft.provisioning === 'scim' ? 'RFC 7642 lifecycle covered by SCIM provisioning.' : 'JIT provisioning is acceptable for login-only apps.',
  ]
}
