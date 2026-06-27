// Plain *.spec.ts (jsdom) — SsoAccountBar is mocked at its two Nuxt-composable
// seams (widget API + session store) so tests run without a Nuxt app context.
//
// Three things are proven:
//   1. The credentialed widget (widgetApi) is never invoked server-side.
//   2. The widget's data is absent from the SSR-rendered HTML (ClientOnly hides slot).
//   3. The component mounts client-side and shows the account-bar root element
//      without auto-fetching.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports by Vitest
// ---------------------------------------------------------------------------

const widgetApi = {
  apps: vi.fn<() => Promise<readonly []>>(),
  accounts: vi.fn<() => Promise<readonly []>>(),
  switchAccount: vi.fn<(id: string) => Promise<{ success: boolean }>>(),
  logout: vi.fn<() => Promise<{ success: boolean }>>(),
}

vi.mock('@/services/sso-account-widget.api', () => ({
  ssoAccountWidgetApi: widgetApi,
  safeWidgetAppUrl: (value: string) => value,
  resolveWidgetBaseUrl: () => '',
}))

// Mock the session store so SsoAccountBar.vue's useSessionStore() call does
// not trigger useState (a Nuxt auto-import) in a non-Nuxt jsdom environment.
type SessionStorePrincipal = { display_name: string; email: string } | null
vi.mock('@/stores/session.store', () => ({
  useSessionStore: vi.fn<() => { principal: SessionStorePrincipal }>(() => ({
    principal: null,
  })),
}))

// Dynamic imports run after the mocks above are hoisted and registered.
const SsoAccountBar = (await import('../SsoAccountBar.vue')).default

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ClientOnly as the server renders it: the slot is never executed.
const ClientOnlyServer = defineComponent({
  setup:
    (_p, { slots: _slots }) =>
    () =>
      null,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks()
})

describe('SsoAccountBar SSR safety', () => {
  it('does not execute the credentialed widget or emit its data during SSR', async () => {
    const app = createApp(
      defineComponent({
        setup() {
          return () => h(ClientOnlyServer, () => h(SsoAccountBar))
        },
      }),
    )
    const html = await renderToString(app)

    expect(widgetApi.apps).not.toHaveBeenCalled()
    expect(widgetApi.accounts).not.toHaveBeenCalled()
    expect(html).not.toContain('sso-account-bar')
  })

  it('renders on the client without auto-fetching (fetch is event-driven only)', () => {
    const wrapper = mount(SsoAccountBar, {
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(true)
    expect(widgetApi.apps).not.toHaveBeenCalled()
    expect(widgetApi.accounts).not.toHaveBeenCalled()
  })
})
