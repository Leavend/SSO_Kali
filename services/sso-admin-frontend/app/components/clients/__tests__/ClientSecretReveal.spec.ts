import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import ClientSecretReveal from '../ClientSecretReveal.vue'

// useI18n calls useCookie/useState (Nuxt auto-imports) that are absent under the
// plain jsdom env — mock it to a passthrough t (keys returned verbatim).
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('id'),
    setLocale: vi.fn<(locale: 'id' | 'en') => void>(),
    availableLocales: ['id', 'en'] as const,
  }),
}))

const SAMPLE_SECRET = 'sample-secret-DO-NOT-USE-9f8e7d6c'

const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)

const baseProps = {
  open: true,
  clientId: 'sample-app',
  secret: SAMPLE_SECRET,
  title: 'Client secret',
  description: 'Shown once.',
  warning: 'Copy it now — it will not be shown again.',
  copyLabel: 'Copy secret',
  clearLabel: 'Clear and close',
  closeLabel: 'Close',
}

beforeEach(() => {
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientSecretReveal', () => {
  it('renders the secret value and the explicit destructive warning once', () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    expect(wrapper.get('[data-testid="client-secret-value"]').text()).toBe(SAMPLE_SECRET)
    expect(wrapper.get('[data-testid="client-secret-warning"]').text()).toContain(
      'will not be shown again',
    )
    // exactly one rendering of the secret in the tree
    expect(wrapper.html().match(new RegExp(SAMPLE_SECRET, 'g'))).toHaveLength(1)
  })

  it('copies the secret to the clipboard, emits copy(), and shows success feedback', async () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SAMPLE_SECRET)
    expect(wrapper.emitted('copy')).toHaveLength(1)
    expect(wrapper.get('[data-testid="client-secret-copy-feedback"]').text()).toBe(
      'clients.copy_success',
    )
  })

  it('copies the full env block (which embeds the secret) when an envSnippet is provided', async () => {
    const envSnippet = `SSO_CLIENT_ID=sample-app\nSSO_CLIENT_SECRET=${SAMPLE_SECRET}`
    const wrapper = mount(ClientSecretReveal, { props: { ...baseProps, envSnippet } })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(envSnippet)
    expect(writeText.mock.calls[0]![0]).toContain(SAMPLE_SECRET)
  })

  it('shows the failure feedback (without logging) when the clipboard write rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeText.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(wrapper.get('[data-testid="client-secret-copy-feedback"]').text()).toBe(
      'clients.copy_failed',
    )
    // The component must never log the secret on the failure path. (We assert the
    // secret is absent from the args rather than "never called": UiDialog's
    // reka-ui layer emits an unrelated aria-hidden warning under detached jsdom
    // mounts — that noise carries no secret and is not our contract.)
    const loggedSecret = errorSpy.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes(SAMPLE_SECRET)),
    )
    expect(loggedSecret).toBe(false)
  })

  it('emits close() when the Clear/Close affordance is clicked (parent owns dismissal)', async () => {
    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('never writes the secret to localStorage / sessionStorage and never logs it', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const wrapper = mount(ClientSecretReveal, { props: baseProps })
    await wrapper.get('[data-testid="client-secret-copy"]').trigger('click')
    await Promise.resolve()
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')

    const storedSecret = localSet.mock.calls.some((call) => String(call[1]).includes(SAMPLE_SECRET))
    expect(storedSecret).toBe(false)
    const loggedSecret = [logSpy, warnSpy, errorSpy].some((spy) =>
      spy.mock.calls.some((call) => call.some((arg) => String(arg).includes(SAMPLE_SECRET))),
    )
    expect(loggedSecret).toBe(false)
  })

  it('is absent from the DOM after the parent nulls the secret ref on close', async () => {
    // Harness reproduces the binding contract: the PARENT owns the secret ref
    // and nulls it (+ closes) on @close. The component caches nothing.
    const Harness = defineComponent({
      components: { ClientSecretReveal },
      setup() {
        const open = ref(true)
        const secret = ref<string | null>(SAMPLE_SECRET)
        const onClose = (): void => {
          secret.value = null
          open.value = false
        }
        return { open, secret, onClose }
      },
      template: `
        <ClientSecretReveal
          :open="open"
          :secret="secret"
          client-id="sample-app"
          title="t"
          description="d"
          warning="w"
          copy-label="Copy"
          clear-label="Clear"
          close-label="Close"
          @close="onClose"
        />`,
    })

    const wrapper = mount(Harness)
    expect(wrapper.html()).toContain(SAMPLE_SECRET)
    await wrapper.get('[data-testid="client-secret-clear"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).not.toContain(SAMPLE_SECRET)
  })
})
