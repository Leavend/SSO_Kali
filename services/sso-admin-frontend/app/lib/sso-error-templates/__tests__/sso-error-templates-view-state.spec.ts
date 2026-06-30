import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  mergeTemplatesByCode,
  resolveEnabledTone,
  resolveSsoErrorTemplatesViewState,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const tpl = (over: Partial<SsoErrorTemplate> = {}): SsoErrorTemplate => ({
  error_code: 'access_denied',
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access.',
  action_label: 'Back to sign-in',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: false,
  is_enabled: true,
  ...over,
})

describe('resolveSsoErrorTemplatesViewState', () => {
  it('returns loading when no data and no error', () => {
    expect(resolveSsoErrorTemplatesViewState({ pending: true, error: null, templates: null })).toBe(
      'loading',
    )
  })
  it('maps 401 to unauthenticated and 403 to forbidden', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(401, 'no'),
        templates: null,
      }),
    ).toBe('unauthenticated')
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(403, 'no'),
        templates: null,
      }),
    ).toBe('forbidden')
  })
  it('returns error for other failures and empty/ready for data', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        templates: null,
      }),
    ).toBe('error')
    expect(
      resolveSsoErrorTemplatesViewState({ pending: false, error: null, templates: [] }),
    ).toBe('empty')
    expect(
      resolveSsoErrorTemplatesViewState({ pending: false, error: null, templates: [tpl()] }),
    ).toBe('ready')
  })
  it('prefers stale data over error (error + cached templates → ready)', () => {
    expect(
      resolveSsoErrorTemplatesViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        templates: [tpl()],
      }),
    ).toBe('ready')
  })
})

describe('resolveEnabledTone / templateKey', () => {
  it('enabled → success, disabled → neutral', () => {
    expect(resolveEnabledTone(true)).toBe('success')
    expect(resolveEnabledTone(false)).toBe('neutral')
  })
  it('builds a stable composite key from error_code + locale', () => {
    expect(templateKey(tpl({ error_code: 'mfa_required', locale: 'id' }))).toBe('mfa_required::id')
  })
})

describe('mergeTemplatesByCode', () => {
  it('groups each code as id-row then en-row', () => {
    const idRows = [
      tpl({ error_code: 'access_denied', locale: 'id' }),
      tpl({ error_code: 'mfa_required', locale: 'id' }),
    ]
    const enRows = [
      tpl({ error_code: 'access_denied', locale: 'en' }),
      tpl({ error_code: 'mfa_required', locale: 'en' }),
    ]
    expect(mergeTemplatesByCode(idRows, enRows).map(templateKey)).toEqual([
      'access_denied::id',
      'access_denied::en',
      'mfa_required::id',
      'mfa_required::en',
    ])
  })
  it('keeps an en-only code that has no id counterpart', () => {
    const idRows = [tpl({ error_code: 'access_denied', locale: 'id' })]
    const enRows = [
      tpl({ error_code: 'access_denied', locale: 'en' }),
      tpl({ error_code: 'session_expired', locale: 'en' }),
    ]
    expect(mergeTemplatesByCode(idRows, enRows).map(templateKey)).toEqual([
      'access_denied::id',
      'access_denied::en',
      'session_expired::en',
    ])
  })
})
