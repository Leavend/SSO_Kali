import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ssoErrorTemplatesApi } from '../../services/sso-error-templates.api'
import { useSsoErrorTemplatesStore } from '../sso-error-templates.store'
import type { SsoErrorTemplate, UpsertSsoErrorTemplatePayload } from '../../types'

vi.mock('../../services/sso-error-templates.api', () => ({
  ssoErrorTemplatesApi: {
    list: vi.fn<() => Promise<unknown>>(),
    get: vi.fn<() => Promise<unknown>>(),
    update: vi.fn<() => Promise<unknown>>(),
    reset: vi.fn<() => Promise<unknown>>(),
  },
}))

vi.mock('@/lib/api/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-client')>()
  return {
    ...actual,
    getLastRequestId: vi.fn<() => string | null>(() => 'req-templates-1'),
  }
})

const templateId: SsoErrorTemplate = {
  error_code: 'session_expired',
  locale: 'id',
  title: 'Sesi berakhir',
  message: 'Silakan login kembali.',
  action_label: 'Login ulang',
  action_url: null,
  retry_allowed: true,
  alternative_login_allowed: false,
  is_enabled: true,
}

const templateEn: SsoErrorTemplate = {
  ...templateId,
  locale: 'en',
  title: 'Session expired',
  message: 'Please sign in again.',
}

const updatePayload: UpsertSsoErrorTemplatePayload = {
  locale: 'id',
  title: 'Sesi berakhir (baru)',
  message: 'Silakan login kembali untuk melanjutkan.',
  action_label: 'Login ulang',
  action_url: null,
  retry_allowed: true,
  alternative_login_allowed: true,
  is_enabled: true,
}

describe('useSsoErrorTemplatesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(ssoErrorTemplatesApi.list).mockReset()
    vi.mocked(ssoErrorTemplatesApi.update).mockReset()
    vi.mocked(ssoErrorTemplatesApi.reset).mockReset()
    vi.mocked(getLastRequestId).mockReturnValue('req-templates-1')
  })

  describe('load()', () => {
    it('loads templates and sets status to success', async () => {
      vi.mocked(ssoErrorTemplatesApi.list).mockResolvedValue({
        templates: [templateId, templateEn],
      })
      const store = useSsoErrorTemplatesStore()

      await store.load()

      expect(store.status).toBe('success')
      expect(store.templates).toEqual([templateId, templateEn])
      expect(store.requestId).toBe('req-templates-1')
    })

    it('maps unauthenticated errors to safe copy', async () => {
      vi.mocked(ssoErrorTemplatesApi.list).mockRejectedValue(new ApiError(401, 'unauthenticated'))
      const store = useSsoErrorTemplatesStore()

      await store.load()

      expect(store.status).toBe('unauthenticated')
      expect(store.errorMessage).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
    })

    it('maps forbidden errors without leaking backend detail', async () => {
      vi.mocked(ssoErrorTemplatesApi.list).mockRejectedValue(
        new ApiError(403, 'SQLSTATE permission leak'),
      )
      const store = useSsoErrorTemplatesStore()

      await store.load()

      expect(store.status).toBe('forbidden')
      expect(store.errorMessage).toBe('Kamu tidak memiliki izin untuk melihat SSO error templates.')
      expect(store.errorMessage).not.toContain('SQLSTATE')
    })

    it('maps server errors with request ID and clears templates', async () => {
      vi.mocked(ssoErrorTemplatesApi.list).mockRejectedValue(
        new ApiError(500, 'crash', null, null, 'req-server'),
      )
      const store = useSsoErrorTemplatesStore()
      store.templates = [templateId]

      await store.load()

      expect(store.status).toBe('error')
      expect(store.templates).toEqual([])
      expect(store.errorMessage).toContain('req-server')
    })
  })

  describe('upsert()', () => {
    it('updates and merges the existing template by error_code + locale', async () => {
      const updated: SsoErrorTemplate = { ...templateId, title: updatePayload.title }
      vi.mocked(ssoErrorTemplatesApi.update).mockResolvedValue({ template: updated })
      const store = useSsoErrorTemplatesStore()
      store.templates = [templateId, templateEn]

      await store.upsert('session_expired', updatePayload)

      expect(ssoErrorTemplatesApi.update).toHaveBeenCalledWith('session_expired', updatePayload)
      expect(store.actionStatus).toBe('success')
      expect(store.selectedTemplate).toEqual(updated)
      expect(store.templates).toHaveLength(2)
      expect(store.templates.find((t) => t.locale === 'id')?.title).toBe(updatePayload.title)
      expect(store.templates.find((t) => t.locale === 'en')).toEqual(templateEn)
    })

    it('prepends a new template when no match exists', async () => {
      const created: SsoErrorTemplate = { ...templateId, error_code: 'csrf_failed' }
      vi.mocked(ssoErrorTemplatesApi.update).mockResolvedValue({ template: created })
      const store = useSsoErrorTemplatesStore()
      store.templates = [templateId]

      await store.upsert('csrf_failed', updatePayload)

      expect(store.templates).toHaveLength(2)
      expect(store.templates[0]).toEqual(created)
    })

    it('maps action errors to safe copy with request ID', async () => {
      vi.mocked(ssoErrorTemplatesApi.update).mockRejectedValue(
        new ApiError(422, 'validation leak', null, null, 'req-action'),
      )
      const store = useSsoErrorTemplatesStore()

      await store.upsert('session_expired', updatePayload)

      expect(store.actionStatus).toBe('error')
      expect(store.errorMessage).toContain('req-action')
      expect(store.errorMessage).not.toContain('validation leak')
    })

    it('maps 428 fresh-auth required to step_up_required without leaking detail', async () => {
      vi.mocked(ssoErrorTemplatesApi.update).mockRejectedValue(
        new ApiError(428, 'raw ACR failure', 'fresh_auth_required', null, 'req-step-up'),
      )
      const store = useSsoErrorTemplatesStore()

      await store.upsert('session_expired', updatePayload)

      expect(store.actionStatus).toBe('step_up_required')
      expect(store.requestId).toBe('req-step-up')
      expect(store.errorMessage).toBe(
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.',
      )
      expect(store.errorMessage).not.toContain('raw ACR')
    })

    it('maps 412 precondition failed to step_up_required', async () => {
      vi.mocked(ssoErrorTemplatesApi.update).mockRejectedValue(
        new ApiError(412, 'mfa assurance required', 'mfa_assurance_required'),
      )
      const store = useSsoErrorTemplatesStore()

      await store.upsert('session_expired', updatePayload)

      expect(store.actionStatus).toBe('step_up_required')
    })
  })

  describe('resetTemplate()', () => {
    it('resets and merges the returned template', async () => {
      const reset: SsoErrorTemplate = { ...templateId, is_enabled: false }
      vi.mocked(ssoErrorTemplatesApi.reset).mockResolvedValue({ template: reset })
      const store = useSsoErrorTemplatesStore()
      store.templates = [templateId]

      await store.resetTemplate('session_expired', 'id')

      expect(ssoErrorTemplatesApi.reset).toHaveBeenCalledWith('session_expired', 'id')
      expect(store.actionStatus).toBe('success')
      expect(store.selectedTemplate).toEqual(reset)
      expect(store.templates[0]?.is_enabled).toBe(false)
    })

    it('maps reset errors to safe copy', async () => {
      vi.mocked(ssoErrorTemplatesApi.reset).mockRejectedValue(new ApiError(500, 'boom'))
      const store = useSsoErrorTemplatesStore()

      await store.resetTemplate('session_expired')

      expect(store.actionStatus).toBe('error')
      expect(store.errorMessage).toContain('req-templates-1')
    })
  })
})
