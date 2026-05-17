import { describe, expect, it } from 'vitest'
import { ApiError } from '../api-error'
import { presentSafeError } from '../safe-error-presenter'

describe('presentSafeError', () => {
  it('redacts technical ApiError messages before UI rendering', () => {
    const error = new ApiError(500, 'SQLSTATE[42P01]: Stack trace leaks user@example.test')

    const safe = presentSafeError(error)

    expect(safe.message).toBe('Layanan SSO sedang tidak tersedia.')
    expect(safe.message).not.toContain('SQLSTATE')
    expect(safe.message).not.toContain('user@example.test')
  })
})
