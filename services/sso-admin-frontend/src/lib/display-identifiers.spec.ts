import { describe, expect, it } from 'vitest'
import { ApiError } from './api/api-client'
import { formatSectionError } from './display-identifiers'

describe('formatSectionError', () => {
  it('includes HTTP status code suffix for ApiErrors', () => {
    const err500 = new ApiError(500, 'Server Error', null, null, 'req-id-500')
    const msg500 = formatSectionError('Audit log events', err500)
    expect(msg500).toContain('(HTTP 500)')
    expect(msg500).toContain('Gunakan kode referensi')

    const err429 = new ApiError(429, 'Too Many Requests', null, null, 'req-id-429')
    const msg429 = formatSectionError('Audit log events', err429)
    expect(msg429).toContain('(HTTP 429)')
  })

  it('omits HTTP status code suffix for non-ApiErrors', () => {
    const err = new Error('Some native error')
    const msg = formatSectionError('Audit log events', err, 'req-id-native')
    expect(msg).not.toContain('HTTP')
    expect(msg).toContain('Gunakan kode referensi')
  })

  it('handles 401 unauthenticated status correctly', () => {
    const err = new ApiError(401, 'Unauthorized')
    const msg = formatSectionError('Audit log events', err)
    expect(msg).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
  })

  it('handles 403 forbidden status correctly with lowercase labels', () => {
    const err = new ApiError(403, 'Forbidden')
    
    const msgAudit = formatSectionError('Audit log events', err)
    expect(msgAudit).toBe('Kamu tidak memiliki izin untuk melihat audit log events.')

    const msgPolicy = formatSectionError('Policy/RBAC admin', err)
    expect(msgPolicy).toBe('Kamu tidak memiliki izin untuk melihat policy/RBAC admin.')
  })
})
