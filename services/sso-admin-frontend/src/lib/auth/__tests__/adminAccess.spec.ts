import { describe, expect, it } from 'vitest'
import { hasAdminRole } from '../adminAccess'

describe('hasAdminRole', () => {
  it('allows users with the admin role only', () => {
    expect(hasAdminRole(['admin'])).toBe(true)
    expect(hasAdminRole(['user', 'admin'])).toBe(true)
    expect(hasAdminRole(['user'])).toBe(false)
    expect(hasAdminRole([])).toBe(false)
  })
})
