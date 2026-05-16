import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ApiError } from '@/lib/api/api-error'
import PrivacyPage from './PrivacyPage.vue'
import { profileApi } from '@/services/profile.api'

vi.mock('@/services/profile.api', () => ({
  profileApi: {
    getDataSubjectRequests: vi.fn(),
    createDataSubjectRequest: vi.fn(),
  },
}))

describe('PrivacyPage data subject request contract', () => {
  it('renders pending request status and SLA copy', async () => {
    vi.mocked(profileApi.getDataSubjectRequests).mockResolvedValue([
      {
        request_id: 'dsr-1',
        type: 'export',
        status: 'submitted',
        reason: 'Need export',
        submitted_at: '2026-05-17T12:00:00Z',
        reviewed_at: null,
        fulfilled_at: null,
        sla_due_at: '2026-06-16T12:00:00Z',
      },
    ])

    const wrapper = mount(PrivacyPage, { global: { stubs: { Skeleton: true } } })
    await flush()

    expect(wrapper.text()).toContain('Privasi & Data')
    expect(wrapper.text()).toContain('Ekspor')
    expect(wrapper.text()).toContain('Diajukan')
    expect(wrapper.text()).toContain('SLA')
  })

  it('creates a request and shows clear acceptance copy', async () => {
    vi.mocked(profileApi.getDataSubjectRequests).mockResolvedValue([])
    vi.mocked(profileApi.createDataSubjectRequest).mockResolvedValue({
      request_id: 'dsr-2',
      type: 'delete',
      status: 'submitted',
      reason: 'Close account',
      submitted_at: '2026-05-17T12:00:00Z',
      reviewed_at: null,
      fulfilled_at: null,
      sla_due_at: '2026-06-16T12:00:00Z',
    })
    const wrapper = mount(PrivacyPage, { global: { stubs: { Skeleton: true } } })
    await flush()

    await wrapper.findAll('button[type="button"]')[1]?.trigger('click')
    await wrapper.find('#privacy-reason').setValue('Close account')
    await wrapper.find('form').trigger('submit.prevent')
    await flush()

    expect(profileApi.createDataSubjectRequest).toHaveBeenCalledWith({
      type: 'delete',
      reason: 'Close account',
    })
    expect(wrapper.text()).toContain('Permintaan privasi diterima')
    expect(wrapper.text()).toContain('Hapus')
  })

  it('renders safe failure copy and support reference without raw legal or technical text', async () => {
    vi.mocked(profileApi.getDataSubjectRequests).mockRejectedValue(
      new ApiError(500, 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.', 'server_error', [], 'http', null, 'SSOERR-PRIVACY1'),
    )

    const wrapper = mount(PrivacyPage, { global: { stubs: { Skeleton: true } } })
    await flush()

    expect(wrapper.text()).toContain('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(wrapper.text()).toContain('Kode dukungan: SSOERR-PRIVACY1')
    expect(wrapper.text()).not.toContain('SQLSTATE')
    expect(wrapper.text()).not.toContain('GDPR Article')
  })
})

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await nextTick()
}
