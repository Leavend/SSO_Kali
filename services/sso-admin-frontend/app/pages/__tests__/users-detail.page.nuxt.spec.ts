// *.nuxt.spec.ts → 'nuxt' env: mountSuspended drives the page's async setup
// (useRoute + useI18n + definePageMeta auto-imports). Data boundary + session
// store are mocked so each UserDetailViewState is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import enLocale from '@/locales/en.json'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDataList from '@/components/ui/UiDataList.vue'
import type { AdminUserDetail, LoginContext, UserSession } from '@/types/users.types'
import type { UserDetailViewState } from '@/lib/users/users-view-state'

const user = ref<AdminUserDetail | null>(null)
const loginContext = ref<LoginContext | null>(null)
const sessions = ref<readonly UserSession[]>([])
const viewState = ref<UserDetailViewState>('loading')
const requestId = ref<string | null>(null)
const refreshMock = vi.fn<() => Promise<void>>(async () => {})

// ponytail: pin locale to 'en' so assertions can use literal English strings.
// The default locale is 'id'; without this mock tests would assert Indonesian
// text which makes the spec fragile and hard to read.
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.')
      let val: unknown = enLocale
      for (const part of parts) {
        val = (val as Record<string, unknown>)?.[part]
      }
      if (typeof val !== 'string') return key
      if (!params) return val
      return val.replace(/\{(\w+)\}/gu, (_: string, k: string) => String(params[k] ?? ''))
    },
  }),
}))

vi.mock('@/composables/useUserDetail', () => ({
  useUserDetail: () => ({
    user,
    loginContext,
    sessions,
    viewState,
    requestId,
    refresh: refreshMock,
  }),
}))

vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({
    principal: { display_name: 'Admin Sentinel' },
    hasPermission: () => true,
  }),
}))

// A raw session id that MUST NOT survive into the rendered tree — the page keys
// rows by index and renders formatTechnicalPreview(id) only.
const RAW_SID = 'session-raw-id-DO-NOT-LEAK-abcdef0123456789'

// PII arrives ALREADY MASKED from the backend (GovernmentIdentifier masking).
// Government identifiers are masked by the backend; formatMaskedIdentifier passes them through —
// no raw 16/18/10-digit run exists. Email is an intentionally-shown operator field (rendered verbatim).
const READY_USER: AdminUserDetail = {
  id: 42,
  subject_id: 'usr_2f9a',
  email: 'target.operator@example.gov',
  given_name: 'Admin',
  family_name: 'Sample',
  display_name: 'Admin Sample',
  role: 'admin',
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
  profile_synced_at: '2026-06-20T10:00:00Z',
  email_verified_at: '2026-06-01T08:00:00Z',
  last_login_at: '2026-06-27T09:15:00Z',
  created_at: '2026-01-10T00:00:00Z',
  nik: '32••••••••••0001',
  nip: '1980••••••••••0002',
  nisn: '00••••0003',
  birth_date: '1980-••-••',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'admin', name: 'Administrator', is_system: true }],
}
const LOGIN: LoginContext = {
  ip_address: '203.0.113.7',
  mfa_required: true,
  last_seen_at: '2026-06-27T09:15:00Z',
}
const SESSIONS: readonly UserSession[] = [
  {
    id: RAW_SID,
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0',
    last_seen_at: '2026-06-27T09:15:00Z',
    created_at: '2026-06-26T00:00:00Z',
  },
]

const UserDetail = (await import('../users/[subjectId].vue')).default

beforeEach(() => {
  user.value = null
  loginContext.value = null
  sessions.value = []
  viewState.value = 'loading'
  requestId.value = null
  vi.clearAllMocks()
})
afterEach(() => vi.clearAllMocks())

describe('user detail page', () => {
  it('always renders the masked principal in the hero with no token/PII', async () => {
    const wrapper = await mountSuspended(UserDetail)
    const principal = wrapper.find('[data-principal-name]')
    expect(principal.exists()).toBe(true)
    expect(principal.text()).toContain('Admin Sentinel')
    expect(wrapper.find('[data-page="user-detail"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
  })

  it('loading → skeleton, no overview panel', async () => {
    viewState.value = 'loading'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiSkeleton).exists()).toBe(true)
    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(false)
  })

  it('forbidden → forbidden status view (no-permission), distinct from not_found', async () => {
    viewState.value = 'forbidden'
    requestId.value = 'admin-req-DENIED42'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('forbidden')
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/SQLSTATE|stack trace|Bearer/i)
  })

  it('unauthenticated → step_up status view', async () => {
    viewState.value = 'unauthenticated'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('step_up')
  })

  it('not_found → dedicated empty surface, not a status view', async () => {
    viewState.value = 'not_found'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiEmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(UiStatusView).exists()).toBe(false)
    expect(wrapper.text()).toContain('User not found')
  })

  it('error → error status view; raw request id is redacted to REF-XXXXXXXX', async () => {
    viewState.value = 'error'
    requestId.value = 'admin-req-FAILED99'
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiStatusView).props('tone')).toBe('error')
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-FAILED99')
  })

  it('ready → overview with masked PII, status badge tone, no raw PII/token', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    sessions.value = SESSIONS
    const wrapper = await mountSuspended(UserDetail)

    expect(wrapper.find('[data-panel="overview"]').exists()).toBe(true)
    // Email renders verbatim (intentionally-shown operator field); government identifiers render masked.
    expect(wrapper.text()).toContain('target.operator@example.gov')
    expect(wrapper.text()).toContain('32••••••••••0001')
    // Account status as a tone+label badge (never colour-alone): active → success.
    const tones = wrapper.findAllComponents(UiStatusBadge).map((b) => b.props('tone'))
    expect(tones).toContain('success')
    // Roles rendered as badges (label present).
    expect(wrapper.text()).toContain('Administrator')
    // No raw secret/token and no raw PII digit-shapes leak into the HTML.
    const html = wrapper.html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    expect(html).not.toMatch(/\d{16}/) // raw NIK shape
    expect(html).not.toMatch(/\d{18}/) // raw NIP shape
    expect(html).not.toMatch(/\d{10}/) // raw NISN shape
  })

  it('ready → security/MFA panel surfaces enrolment + login context', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    const wrapper = await mountSuspended(UserDetail)
    const security = wrapper.find('[data-panel="security"]')
    expect(security.exists()).toBe(true)
    expect(security.text()).toContain('MFA enrolled')
    expect(security.text()).toContain('totp')
    expect(security.text()).toContain('203.0.113.7') // login_context ip
  })

  it('ready → sessions list is read-only and masks the raw session id', async () => {
    viewState.value = 'ready'
    user.value = READY_USER
    loginContext.value = LOGIN
    sessions.value = SESSIONS
    const wrapper = await mountSuspended(UserDetail)
    expect(wrapper.findComponent(UiDataList).exists()).toBe(true)
    const html = wrapper.html()
    expect(html).toContain('REF-') // formatTechnicalPreview masked id
    expect(html).not.toContain(RAW_SID) // raw session id never rendered
    // No terminate/revoke control on this read-only surface (added in 4.11).
    expect(wrapper.text()).not.toMatch(/revoke|terminate/i)
  })
})
