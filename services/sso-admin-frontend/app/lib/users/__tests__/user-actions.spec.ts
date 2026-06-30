import { describe, expect, it } from 'vitest'
import { USER_ACTIONS, isReasonValid, type UserActionId } from '../user-actions'

describe('USER_ACTIONS descriptor table', () => {
  it('maps each lifecycle action to its backend permission', () => {
    expect(USER_ACTIONS.lock.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.unlock.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.require_mfa.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.unrequire_mfa.permission).toBe('admin.users.lock')
    expect(USER_ACTIONS.deactivate.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.reactivate.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.reset_mfa.permission).toBe('admin.users.write')
    expect(USER_ACTIONS.password_reset.permission).toBe('admin.users.write')
  })

  it('flags the destructive affordances as danger, the routine restorations as not', () => {
    const danger: UserActionId[] = [
      'lock',
      'deactivate',
      'reset_mfa',
      'password_reset',
      'require_mfa',
    ]
    for (const id of danger) expect(USER_ACTIONS[id].danger).toBe(true)
    expect(USER_ACTIONS.unlock.danger).toBe(false)
    expect(USER_ACTIONS.reactivate.danger).toBe(false)
    expect(USER_ACTIONS.unrequire_mfa.danger).toBe(false)
  })

  it('requires confirmation for every action except the no-reason restorations', () => {
    expect(USER_ACTIONS.unlock.confirmRequired).toBe(false)
    expect(USER_ACTIONS.reactivate.confirmRequired).toBe(false)
    for (const id of [
      'lock',
      'deactivate',
      'reset_mfa',
      'password_reset',
      'require_mfa',
      'unrequire_mfa',
    ] as UserActionId[])
      expect(USER_ACTIONS[id].confirmRequired).toBe(true)
  })

  it('encodes the backend reason rules', () => {
    expect(USER_ACTIONS.lock.reason).toEqual({ required: true, max: 255 })
    expect(USER_ACTIONS.unlock.reason).toEqual({ required: false, max: 255 })
    expect(USER_ACTIONS.reset_mfa.reason).toEqual({ required: true, min: 8, max: 240 })
    expect(USER_ACTIONS.reactivate.reason).toBeNull()
    expect(USER_ACTIONS.password_reset.reason).toBeNull()
  })

  it('every id is its own key (no descriptor drift)', () => {
    for (const id of Object.keys(USER_ACTIONS) as UserActionId[])
      expect(USER_ACTIONS[id].id).toBe(id)
  })
})

describe('isReasonValid', () => {
  it('treats a null policy as always valid', () => {
    expect(isReasonValid(null, '')).toBe(true)
    expect(isReasonValid(null, 'anything')).toBe(true)
  })
  it('rejects empty/whitespace when required, accepts empty when optional', () => {
    expect(isReasonValid({ required: true, max: 255 }, '')).toBe(false)
    expect(isReasonValid({ required: true, max: 255 }, '   ')).toBe(false)
    expect(isReasonValid({ required: true, max: 255 }, 'Compromised credential')).toBe(true)
    expect(isReasonValid({ required: false, max: 255 }, '')).toBe(true)
  })
  it('enforces min and max length on the trimmed value', () => {
    expect(isReasonValid({ required: true, min: 8, max: 240 }, 'short')).toBe(false)
    expect(isReasonValid({ required: true, min: 8, max: 240 }, 'long enough reason')).toBe(true)
    expect(isReasonValid({ required: true, max: 255 }, 'x'.repeat(256))).toBe(false)
    expect(isReasonValid({ required: false, max: 255 }, 'x'.repeat(256))).toBe(false)
  })
})
