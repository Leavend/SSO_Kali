import { describe, expect, it } from 'vitest'
import {
  evaluateManagedUserPassword,
  isManagedUserPasswordValid,
  type PasswordRequirementId,
} from '../managed-user-password-policy'

const met = (password: string, id: PasswordRequirementId): boolean => {
  const requirement = evaluateManagedUserPassword(password).find((r) => r.id === id)
  if (!requirement) throw new Error(`missing requirement ${id}`)
  return requirement.met
}

describe('evaluateManagedUserPassword', () => {
  it('returns all six requirements in a stable order', () => {
    const ids = evaluateManagedUserPassword('').map((r) => r.id)
    expect(ids).toEqual(['min_length', 'uppercase', 'lowercase', 'number', 'symbol', 'max_length'])
  })

  it('flags min_length only at 12+ characters', () => {
    expect(met('Ab1!aaaa', 'min_length')).toBe(false) // 8 chars
    expect(met('Ab1!aaaaaaaa', 'min_length')).toBe(true) // 12 chars
  })

  it('flags each character class independently', () => {
    expect(met('ab1!ab1!ab1!', 'uppercase')).toBe(false)
    expect(met('AB1!AB1!AB1!', 'lowercase')).toBe(false)
    expect(met('Abcd!Abcd!Ab', 'number')).toBe(false)
    expect(met('Abcd1Abcd1Ab', 'symbol')).toBe(false)
    expect(met('Abcd1!Abcd1!', 'uppercase')).toBe(true)
  })

  it('keeps max_length met until length exceeds 128', () => {
    expect(met('A'.repeat(128), 'max_length')).toBe(true)
    expect(met('A'.repeat(129), 'max_length')).toBe(false)
  })
})

describe('isManagedUserPasswordValid', () => {
  it('treats an empty string as valid (password is optional)', () => {
    expect(isManagedUserPasswordValid('')).toBe(true)
  })

  it('requires every requirement for a non-empty password', () => {
    expect(isManagedUserPasswordValid('short')).toBe(false)
    expect(isManagedUserPasswordValid('Str0ng!Passw0rd')).toBe(true)
  })

  it('rejects a password over 128 characters even if otherwise strong', () => {
    expect(isManagedUserPasswordValid(`Aa1!${'a'.repeat(130)}`)).toBe(false)
  })
})
