import { describe, expect, it } from 'vitest'
import {
  buildUpsertPayload,
  templateToFormModel,
  validateSsoErrorTemplateForm,
  type SsoErrorTemplateFormModel,
} from '@/lib/sso-error-templates/sso-error-template-form'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const model = (over: Partial<SsoErrorTemplateFormModel> = {}): SsoErrorTemplateFormModel => ({
  locale: 'en',
  title: 'Access denied',
  message: 'You do not have access to this application.',
  action_label: 'Back to sign-in',
  action_url: '',
  retry_allowed: false,
  alternative_login_allowed: true,
  is_enabled: true,
  ...over,
})

describe('validateSsoErrorTemplateForm', () => {
  it('accepts a well-formed model with a blank optional action_url', () => {
    expect(validateSsoErrorTemplateForm(model()).valid).toBe(true)
  })
  it('flags required text fields', () => {
    const r = validateSsoErrorTemplateForm(model({ title: '   ', message: '', action_label: '' }))
    expect(r.fieldErrors).toMatchObject({
      title: 'required',
      message: 'required',
      action_label: 'required',
    })
  })
  it('flags over-length title/message/action_label', () => {
    const r = validateSsoErrorTemplateForm(
      model({ title: 'a'.repeat(121), message: 'm'.repeat(501), action_label: 'b'.repeat(81) }),
    )
    expect(r.fieldErrors).toMatchObject({
      title: 'too_long',
      message: 'too_long',
      action_label: 'too_long',
    })
  })
  it('rejects a non-https or unparsable action_url, accepts https', () => {
    expect(validateSsoErrorTemplateForm(model({ action_url: 'http://x.test' })).fieldErrors).toMatchObject({
      action_url: 'invalid_url',
    })
    expect(validateSsoErrorTemplateForm(model({ action_url: 'not a url' })).fieldErrors).toMatchObject({
      action_url: 'invalid_url',
    })
    expect(validateSsoErrorTemplateForm(model({ action_url: 'https://sso.example/help' })).valid).toBe(
      true,
    )
  })
  it('flags an over-length action_url before scheme', () => {
    const long = `https://sso.example/${'p'.repeat(500)}`
    expect(validateSsoErrorTemplateForm(model({ action_url: long })).fieldErrors).toMatchObject({
      action_url: 'too_long',
    })
  })
})

describe('buildUpsertPayload', () => {
  it('trims text and maps a blank action_url to null', () => {
    expect(buildUpsertPayload(model({ title: '  Hi  ', action_url: '   ' }))).toEqual({
      locale: 'en',
      title: 'Hi',
      message: 'You do not have access to this application.',
      action_label: 'Back to sign-in',
      action_url: null,
      retry_allowed: false,
      alternative_login_allowed: true,
      is_enabled: true,
    })
  })
  it('keeps a present action_url', () => {
    expect(buildUpsertPayload(model({ action_url: ' https://sso.example/help ' })).action_url).toBe(
      'https://sso.example/help',
    )
  })
})

describe('templateToFormModel', () => {
  it('seeds the model from a template, normalising a null action_url to empty string', () => {
    const template: SsoErrorTemplate = {
      error_code: 'mfa_required',
      locale: 'id',
      title: 'Verifikasi diperlukan',
      message: 'Selesaikan verifikasi.',
      action_label: 'Lanjut',
      action_url: null,
      retry_allowed: true,
      alternative_login_allowed: false,
      is_enabled: false,
    }
    expect(templateToFormModel(template)).toEqual({
      locale: 'id',
      title: 'Verifikasi diperlukan',
      message: 'Selesaikan verifikasi.',
      action_label: 'Lanjut',
      action_url: '',
      retry_allowed: true,
      alternative_login_allowed: false,
      is_enabled: false,
    })
  })
})
