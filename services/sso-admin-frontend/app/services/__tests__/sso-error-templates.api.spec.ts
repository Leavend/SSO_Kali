import { afterEach, describe, expect, it, vi } from 'vitest'
import { ssoErrorTemplatesApi } from '@/services/sso-error-templates.api'
import { apiClient } from '@/lib/api/api-client'
import type { UpsertSsoErrorTemplatePayload } from '@/types/sso-error-templates.types'

const payload: UpsertSsoErrorTemplatePayload = {
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
}

afterEach(() => vi.restoreAllMocks())

describe('ssoErrorTemplatesApi', () => {
  it('lists via GET on the admin base path', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ templates: [] } as never)
    await ssoErrorTemplatesApi.list()
    expect(get).toHaveBeenCalledWith('/api/admin/sso-error-templates')
  })
  it('updates via PATCH on the per-code path (encoded) with the payload', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ template: {} } as never)
    await ssoErrorTemplatesApi.update('access_denied', payload)
    expect(patch).toHaveBeenCalledWith('/api/admin/sso-error-templates/access_denied', payload)
  })
  it('resets via POST on the per-code reset path with the locale body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ template: {} } as never)
    await ssoErrorTemplatesApi.reset('access_denied', 'id')
    expect(post).toHaveBeenCalledWith('/api/admin/sso-error-templates/access_denied/reset', {
      locale: 'id',
    })
  })
})
