import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import type { AdminClientDetail, ScopeCatalogEntry } from '@/types/clients.types'
import type { PrivilegedActionFailure } from '@/lib/users/privileged-action'

const clientsApi = {
  update: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
  syncScopes: vi.fn<(id: string, payload: unknown) => Promise<unknown>>(),
}
vi.mock('@/services/clients.api', () => ({ clientsApi }))

let permitted: string[] = []
vi.mock('@/stores/session.store', () => ({
  useSessionStore: () => ({ hasPermission: (p: string) => permitted.includes(p) }),
}))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const isSubmitting = ref(false)
const failure = ref<PrivilegedActionFailure | null>(null)
const runImpl = vi.fn<(fn: () => Promise<unknown>) => Promise<unknown>>(async (fn) => fn())
vi.mock('@/composables/usePrivilegedAction', () => ({
  usePrivilegedAction: () => ({
    status: ref('idle'),
    isSubmitting,
    failure,
    requestId: computed(() => failure.value?.requestId ?? null),
    auditEventId: computed(() => failure.value?.auditEventId ?? null),
    fieldErrors: computed(() => failure.value?.fieldErrors ?? {}),
    stepUpUrl: computed(() => failure.value?.stepUpUrl ?? null),
    run: runImpl,
    reset: () => {
      failure.value = null
      isSubmitting.value = false
    },
  }),
}))

// Dynamic import after the vi.mock registrations + top-level doubles: a static
// `import … from` is hoisted ABOVE these consts, so the mock factories would
// dereference them before initialization (TDZ). Mirrors UserLifecycleActions.spec.
const ClientScopePolicyForm = (await import('../ClientScopePolicyForm.vue')).default

const catalog: ScopeCatalogEntry[] = [
  { name: 'openid', description: 'Subject', claims: ['sub'], default_allowed: true },
  { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
  { name: 'email', description: 'Email', claims: ['email'], default_allowed: false },
]

// Client carries a custom scope absent from the catalog -> parity warning + merged grid row.
const client = {
  client_id: 'portal',
  allowed_scopes: ['openid', 'profile', 'legacy:read'],
} as unknown as AdminClientDetail

// Stub UiSwitch as a checkbox so the grid is assertable by scope name.
const SwitchStub = {
  name: 'UiSwitch',
  props: ['modelValue', 'label', 'disabled'],
  emits: ['update:modelValue'],
  template: `<label :data-scope="label" :data-disabled="disabled">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />{{ label }}</label>`,
}

function mountForm() {
  return mount(ClientScopePolicyForm, {
    props: { client, catalog },
    global: { stubs: { UiSwitch: SwitchStub } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  permitted = ['admin.clients.write']
  isSubmitting.value = false
  failure.value = null
  runImpl.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  clientsApi.syncScopes.mockResolvedValue({ client })
})

describe('ClientScopePolicyForm — grid + parity', () => {
  it('renders nothing when the operator may not write', () => {
    permitted = []
    expect(mountForm().find('[data-testid="client-scope-policy-form"]').exists()).toBe(false)
  })
  it('renders the merged catalog ∪ client scopes (including the custom one)', () => {
    const w = mountForm()
    for (const name of ['openid', 'profile', 'email', 'legacy:read'])
      expect(w.find(`[data-scope="${name}"]`).exists()).toBe(true)
  })
  it('forces openid on and disabled', () => {
    const row = mountForm().find('[data-scope="openid"]')
    expect(row.attributes('data-disabled')).toBe('true')
    expect((row.find('input').element as HTMLInputElement).checked).toBe(true)
  })
  it('shows the scope parity warning for client scopes absent from the catalog', () => {
    const w = mountForm()
    const banner = w.find('[data-testid="scope-parity-warning"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('legacy:read')
  })
})

describe('ClientScopePolicyForm — submit', () => {
  it('toggles a scope, syncs the selected set, and emits done', async () => {
    const w = mountForm()
    await w.find('[data-scope="email"] input').setValue(true)
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(clientsApi.syncScopes).toHaveBeenCalledTimes(1)
    const [id, payload] = clientsApi.syncScopes.mock.calls[0] as [string, { scopes: string[] }]
    expect(id).toBe('portal')
    expect([...payload.scopes].sort()).toEqual(['email', 'legacy:read', 'openid', 'profile'])
    expect(w.emitted('done')).toHaveLength(1)
  })
  it('cannot deselect openid (forced) — it stays in the synced set', async () => {
    const w = mountForm()
    await w.find('[data-scope="profile"] input').setValue(false)
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    const [, payload] = clientsApi.syncScopes.mock.calls[0] as [string, { scopes: string[] }]
    expect(payload.scopes).toContain('openid')
    expect(payload.scopes).not.toContain('profile')
  })
})

describe('ClientScopePolicyForm — failure surface', () => {
  it('surfaces an invalid (422) failure with REF and no stale loading', async () => {
    runImpl.mockImplementation(async () => {
      failure.value = {
        status: 'invalid',
        requestId: 'req-scope-11223344',
        auditEventId: null,
        fieldErrors: { scopes: ['unknown scope'] },
        stepUpUrl: null,
      }
      isSubmitting.value = false
      return null
    })
    const w = mountForm()
    await w.find('[data-testid="client-scope-policy-form"]').trigger('submit')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="scope-policy-error"]').exists()).toBe(true)
    expect(w.text()).toContain('REF-')
    expect(w.text()).not.toContain('req-scope-11223344')
    expect(w.emitted('done')).toBeUndefined()
    expect(isSubmitting.value).toBe(false)
  })
})
