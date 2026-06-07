import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PrivacyPage from '../PrivacyPage.vue'
import { profileApi } from '@/services/profile.api'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getDataSubjectRequests: vi.fn(),
    createDataSubjectRequest: vi.fn(),
  },
}))

const existingRequest = {
  request_id: 'dsr-export-1',
  type: 'export',
  status: 'submitted',
  reason: 'Audit pribadi akun SSO',
  submitted_at: '2026-05-19T08:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-18T08:00:00Z',
} as const

describe('PrivacyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(profileApi.getDataSubjectRequests).mockResolvedValue([existingRequest])
    vi.mocked(profileApi.createDataSubjectRequest).mockResolvedValue({
      ...existingRequest,
      request_id: 'dsr-created-1',
      type: 'delete',
      reason: 'Diperlukan untuk permintaan penghapusan akun.',
    })
  })

  async function mountPrivacyPage(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(PrivacyPage, {
      global: {
        stubs: {
          ConfirmDialog: {
            props: ['open', 'title', 'description', 'confirmLabel', 'destructive'],
            emits: ['confirm', 'update:open'],
            template: `
              <section v-if="open" data-testid="privacy-confirm-dialog">
                <h2>{{ title }}</h2>
                <p>{{ description }}</p>
                <button
                  data-testid="privacy-confirm-action"
                  :class="destructive ? 'bg-destructive' : ''"
                  @click="$emit('confirm')"
                >{{ confirmLabel }}</button>
              </section>
            `,
          },
          Skeleton: true,
        },
      },
    })

    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('defaults to the safest export option and shows distinct risk treatment per action', async () => {
    const wrapper = await mountPrivacyPage()

    expect(wrapper.find('[data-testid="privacy-type-export"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.find('[data-testid="privacy-type-delete"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(wrapper.text()).toContain('Aman — tidak mengubah data.')
    expect(wrapper.text()).toContain('Destruktif')
    expect(wrapper.text()).toContain('Permanen')
    expect(wrapper.text()).toContain('tenggat peninjauan 30 hari dan status yang bisa kamu pantau')
    expect(wrapper.text()).toContain('Konteks tambahan (opsional)')
    expect(wrapper.find('input#privacy-reason').attributes('placeholder')).toBe(
      'Contoh: diperlukan untuk keperluan audit akun internal',
    )
    expect(wrapper.text()).not.toContain('SLA yang transparan')
    expect(wrapper.text()).not.toContain('Alasan / konteks opsional')
    expect(wrapper.text()).not.toContain('butuh')
  })

  it('keeps request cards relaxed on small widths with balanced dark risk colors', async () => {
    const wrapper = await mountPrivacyPage()
    const optionGridElement = wrapper.find('[data-testid="privacy-type-export"]').element
      .parentElement

    if (!(optionGridElement instanceof HTMLElement)) {
      throw new Error('Missing privacy request option grid.')
    }

    expect(optionGridElement.className).toContain('md:grid-cols-3')
    expect(optionGridElement.className).not.toContain('sm:grid-cols-3')

    await wrapper.find('[data-testid="privacy-type-delete"]').trigger('click')
    await nextTick()

    const deleteOptionClasses = wrapper.find('[data-testid="privacy-type-delete"]').classes()
    const submitButtonClasses = wrapper.find('[data-testid="privacy-submit-button"]').classes()

    expect(deleteOptionClasses).toContain('dark:border-error-700/50')
    expect(deleteOptionClasses).toContain('dark:bg-error-950/30')
    expect(submitButtonClasses).toContain('dark:bg-destructive/70')
  })

  it('uses contextual CTA text and requires confirmation before destructive requests', async () => {
    const wrapper = await mountPrivacyPage()

    expect(wrapper.find('[data-testid="privacy-submit-button"]').text()).toContain(
      'Ajukan Ekspor Data',
    )

    await wrapper.find('[data-testid="privacy-type-delete"]').trigger('click')
    await nextTick()

    const submitButton = wrapper.find('[data-testid="privacy-submit-button"]')
    expect(submitButton.text()).toContain('Ajukan Penghapusan Data')
    expect(submitButton.classes()).toContain('bg-destructive')

    await wrapper.find('form').trigger('submit.prevent')
    await nextTick()

    expect(profileApi.createDataSubjectRequest).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="privacy-confirm-dialog"]').text()).toContain(
      'Kamu yakin ingin mengajukan penghapusan?',
    )
    expect(wrapper.find('[data-testid="privacy-confirm-dialog"]').text()).toContain(
      'Tindakan ini tidak dapat dibatalkan setelah diverifikasi.',
    )
    expect(wrapper.find('[data-testid="privacy-confirm-action"]').text()).toContain(
      'Ya, Ajukan Penghapusan',
    )

    await wrapper.find('[data-testid="privacy-confirm-action"]').trigger('click')
    await flushPromises()

    expect(profileApi.createDataSubjectRequest).toHaveBeenCalledWith({
      type: 'delete',
      reason: null,
    })
  })

  it('shows anonymization as irreversible with its own CTA and confirmation copy', async () => {
    const wrapper = await mountPrivacyPage()

    await wrapper.find('[data-testid="privacy-type-anonymize"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="privacy-submit-button"]').text()).toContain(
      'Ajukan Anonimisasi Data',
    )

    await wrapper.find('form').trigger('submit.prevent')
    await nextTick()

    expect(wrapper.find('[data-testid="privacy-confirm-dialog"]').text()).toContain(
      'Kamu yakin ingin mengajukan anonimisasi?',
    )
    expect(wrapper.find('[data-testid="privacy-confirm-action"]').text()).toContain(
      'Ya, Ajukan Anonimisasi',
    )
  })

  it('differentiates request type and workflow status while formatting timestamps consistently', async () => {
    const wrapper = await mountPrivacyPage()

    const typeBadge = wrapper.find('[data-testid="privacy-request-type-badge"]')
    const statusBadge = wrapper.find('[data-testid="privacy-request-status-badge"]')

    expect(typeBadge.text()).toBe('Ekspor')
    expect(typeBadge.classes()).toContain('rounded-md')
    expect(statusBadge.text()).toBe('Diajukan')
    expect(statusBadge.classes()).toContain('rounded-full')
    expect(wrapper.text()).toContain('Diajukan: 19 Mei 2026')
    expect(wrapper.text()).toContain('SLA: 18 Jun 2026')
    expect(wrapper.text()).toContain('Selesai: Belum selesai')
    expect(wrapper.text()).not.toContain('16.00')
    expect(wrapper.text()).not.toContain('Selesai: —')
    expect(wrapper.text()).toContain('Pantau status dan tenggat waktu penyelesaian permintaan kamu')
  })

  it('renders an empty state when no privacy requests exist yet', async () => {
    vi.mocked(profileApi.getDataSubjectRequests).mockResolvedValueOnce([])

    const wrapper = await mountPrivacyPage()

    expect(wrapper.find('[data-testid="privacy-empty-state"]').text()).toContain(
      'Belum ada permintaan yang diajukan. Gunakan form di atas untuk memulai.',
    )
  })
})
