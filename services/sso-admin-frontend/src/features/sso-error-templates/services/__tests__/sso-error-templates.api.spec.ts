import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/api-client'
import { ssoErrorTemplatesApi } from '../sso-error-templates.api'
import type { UpsertSsoErrorTemplatePayload } from '../../types'

const payload: UpsertSsoErrorTemplatePayload = {
  locale: 'id',
  title: 'Sesi berakhir',
  message: 'Silakan login kembali.',
  action_label: 'Login ulang',
  action_url: 'https://sso.example.test/login',
  retry_allowed: true,
  alternative_login_allowed: false,
  is_enabled: true,
}

describe('ssoErrorTemplatesApi', () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let putSpy: ReturnType<typeof vi.spyOn>
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(apiClient, 'get')
    putSpy = vi.spyOn(apiClient, 'put')
    postSpy = vi.spyOn(apiClient, 'post')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('list()', () => {
    it('calls GET /api/admin/sso-error-templates', async () => {
      const expected = { templates: [] }
      getSpy.mockResolvedValueOnce(expected)

      const result = await ssoErrorTemplatesApi.list()

      expect(result).toEqual(expected)
      expect(getSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates')
    })
  })

  describe('get()', () => {
    it('calls GET /api/admin/sso-error-templates/:errorCode without locale header', async () => {
      const template = { template: { error_code: 'server_error' } }
      getSpy.mockResolvedValueOnce(template)

      const result = await ssoErrorTemplatesApi.get('server_error')

      expect(result).toEqual(template)
      expect(getSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/server_error', {
        headers: undefined,
      })
    })

    it('forwards locale via Accept-Language header', async () => {
      getSpy.mockResolvedValueOnce({ template: { error_code: 'server_error' } })

      await ssoErrorTemplatesApi.get('server_error', 'en')

      expect(getSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/server_error', {
        headers: { 'Accept-Language': 'en' },
      })
    })

    it('encodes the error code path segment', async () => {
      getSpy.mockResolvedValueOnce({ template: { error_code: 'a/b' } })

      await ssoErrorTemplatesApi.get('a/b')

      expect(getSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/a%2Fb', {
        headers: undefined,
      })
    })
  })

  describe('update()', () => {
    it('calls PUT /api/admin/sso-error-templates/:errorCode with payload', async () => {
      const expected = { template: { error_code: 'session_expired' } }
      putSpy.mockResolvedValueOnce(expected)

      const result = await ssoErrorTemplatesApi.update('session_expired', payload)

      expect(result).toEqual(expected)
      expect(putSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/session_expired', payload)
    })
  })

  describe('reset()', () => {
    it('calls POST /api/admin/sso-error-templates/:errorCode/reset with provided locale', async () => {
      const expected = { template: { error_code: 'session_expired' } }
      postSpy.mockResolvedValueOnce(expected)

      const result = await ssoErrorTemplatesApi.reset('session_expired', 'en')

      expect(result).toEqual(expected)
      expect(postSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/session_expired/reset', {
        locale: 'en',
      })
    })

    it('defaults locale to id when omitted', async () => {
      postSpy.mockResolvedValueOnce({ template: { error_code: 'server_error' } })

      await ssoErrorTemplatesApi.reset('server_error')

      expect(postSpy).toHaveBeenCalledWith('/api/admin/sso-error-templates/server_error/reset', {
        locale: 'id',
      })
    })
  })
})
