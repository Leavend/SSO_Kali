import { describe, expect, it } from 'vitest'
import {
  EMAIL_PATTERN,
  formatMaskedIdentifier,
  isValidBirthDate,
  isValidEmail,
  isValidNik,
  isValidNip,
  isValidNisn,
  normalizeEmail,
} from '../user-identifiers'

describe('email', () => {
  it('EMAIL_PATTERN matches a simple address and rejects malformed input', () => {
    expect(EMAIL_PATTERN.test('admin@example.com')).toBe(true)
    expect(EMAIL_PATTERN.test('no-at-sign')).toBe(false)
    expect(EMAIL_PATTERN.test('user@example')).toBe(false)
  })

  it('isValidEmail accepts a well-formed address and rejects spaces/missing parts', () => {
    expect(isValidEmail('user@example.co.id')).toBe(true)
    expect(isValidEmail('user @example.com')).toBe(false)
    expect(isValidEmail('user@example')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Example.COM  ')).toBe('admin@example.com')
  })
})

describe('government identifiers (backend regexes verbatim)', () => {
  it('isValidNik requires exactly 16 digits', () => {
    expect(isValidNik('1234567890123456')).toBe(true)
    expect(isValidNik('123456789012345')).toBe(false) // 15
    expect(isValidNik('12345678901234567')).toBe(false) // 17
    expect(isValidNik('12345678901234ab')).toBe(false)
  })

  it('isValidNip requires exactly 18 digits', () => {
    expect(isValidNip('123456789012345678')).toBe(true)
    expect(isValidNip('12345678901234567')).toBe(false) // 17
    expect(isValidNip('1234567890123456789')).toBe(false) // 19
  })

  it('isValidNisn requires exactly 10 digits', () => {
    expect(isValidNisn('0123456789')).toBe(true)
    expect(isValidNisn('012345678')).toBe(false) // 9
    expect(isValidNisn('01234567890')).toBe(false) // 11
  })
})

describe('birth date', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isValidBirthDate('1990-07-15')).toBe(true)
  })

  it('rejects malformed shapes', () => {
    expect(isValidBirthDate('1990-7-15')).toBe(false)
    expect(isValidBirthDate('15-07-1990')).toBe(false)
    expect(isValidBirthDate('1990/07/15')).toBe(false)
    expect(isValidBirthDate('')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isValidBirthDate('2026-02-30')).toBe(false)
    expect(isValidBirthDate('2026-13-01')).toBe(false)
    expect(isValidBirthDate('2026-00-10')).toBe(false)
  })
})

describe('formatMaskedIdentifier', () => {
  it('renders an em dash for null/undefined/empty', () => {
    expect(formatMaskedIdentifier(null)).toBe('—')
    expect(formatMaskedIdentifier(undefined)).toBe('—')
    expect(formatMaskedIdentifier('')).toBe('—')
  })

  it('passes through an already-masked backend value unchanged', () => {
    expect(formatMaskedIdentifier('••••••••3456')).toBe('••••••••3456')
  })
})
