import { describe, expect, it } from 'vitest'
import { validateCreateRole, validateUpdateRole } from '@/lib/roles/role-form'

describe('validateCreateRole', () => {
  it('accepts a valid role and returns a trimmed payload with null description when blank', () => {
    const r = validateCreateRole({
      slug: '  support-agent ',
      name: '  Support Agent  ',
      description: '   ',
    })
    expect(r.valid).toBe(true)
    expect(r.fieldErrors).toEqual({ slug: undefined, name: undefined, description: undefined })
    expect(r.payload).toEqual({ slug: 'support-agent', name: 'Support Agent', description: null })
  })

  it('trims and keeps a non-empty description', () => {
    const r = validateCreateRole({ slug: 'ops', name: 'Ops', description: '  read only access  ' })
    expect(r.payload).toEqual({ slug: 'ops', name: 'Ops', description: 'read only access' })
  })

  it('rejects a blank slug', () => {
    const r = validateCreateRole({ slug: '   ', name: 'Ops', description: '' })
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.slug).toBeDefined()
    expect(r.payload).toBeNull()
  })

  it('rejects a slug that breaks the pattern (uppercase / leading hyphen)', () => {
    expect(
      validateCreateRole({ slug: 'Ops', name: 'Ops', description: '' }).fieldErrors.slug,
    ).toBeDefined()
    expect(
      validateCreateRole({ slug: '-ops', name: 'Ops', description: '' }).fieldErrors.slug,
    ).toBeDefined()
  })

  it('rejects a slug over 64 chars', () => {
    const r = validateCreateRole({ slug: 'a'.repeat(65), name: 'Ops', description: '' })
    expect(r.fieldErrors.slug).toBeDefined()
    expect(r.valid).toBe(false)
  })

  it('rejects a blank name and a name over 120 chars', () => {
    expect(
      validateCreateRole({ slug: 'ops', name: '   ', description: '' }).fieldErrors.name,
    ).toBeDefined()
    expect(
      validateCreateRole({ slug: 'ops', name: 'n'.repeat(121), description: '' }).fieldErrors.name,
    ).toBeDefined()
  })

  it('rejects a description over 255 chars', () => {
    const r = validateCreateRole({ slug: 'ops', name: 'Ops', description: 'd'.repeat(256) })
    expect(r.fieldErrors.description).toBeDefined()
    expect(r.valid).toBe(false)
  })
})

describe('validateUpdateRole', () => {
  it('validates name only and never reports a slug error', () => {
    const r = validateUpdateRole({ name: 'Renamed Ops', description: 'desc' })
    expect(r.valid).toBe(true)
    expect(r.fieldErrors.slug).toBeUndefined()
    expect(r.payload).toEqual({ name: 'Renamed Ops', description: 'desc' })
  })

  it('clears description to null when blank', () => {
    expect(validateUpdateRole({ name: 'Ops', description: '   ' }).payload).toEqual({
      name: 'Ops',
      description: null,
    })
  })

  it('rejects a blank name', () => {
    const r = validateUpdateRole({ name: '  ', description: '' })
    expect(r.valid).toBe(false)
    expect(r.fieldErrors.name).toBeDefined()
    expect(r.payload).toBeNull()
  })
})
