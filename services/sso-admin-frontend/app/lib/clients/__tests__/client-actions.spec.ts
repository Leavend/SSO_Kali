import { describe, expect, it } from 'vitest'
import { CLIENT_ACTIONS, type ClientActionId } from '../client-actions'
import { isReasonValid } from '@/lib/users/user-actions'

describe('CLIENT_ACTIONS descriptor table', () => {
  it('gates every lifecycle action behind BOTH clients-write and sessions-terminate', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[]) {
      expect(CLIENT_ACTIONS[id].permission).toBe('admin.clients.write')
      expect(CLIENT_ACTIONS[id].secondaryPermission).toBe('admin.sessions.terminate')
    }
  })

  it('flags the destructive affordances as danger, activate as routine', () => {
    expect(CLIENT_ACTIONS.activate.danger).toBe(false)
    for (const id of ['disable', 'decommission', 'delete'] as ClientActionId[])
      expect(CLIENT_ACTIONS[id].danger).toBe(true)
  })

  it('requires confirmation for every lifecycle action (all are step-up + impactful)', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[])
      expect(CLIENT_ACTIONS[id].confirmRequired).toBe(true)
  })

  it('encodes the reason policy: optional reason on disable/decommission, none elsewhere', () => {
    expect(CLIENT_ACTIONS.disable.reason).toEqual({ required: false, max: 255 })
    expect(CLIENT_ACTIONS.decommission.reason).toEqual({ required: false, max: 255 })
    expect(CLIENT_ACTIONS.activate.reason).toBeNull()
    expect(CLIENT_ACTIONS.delete.reason).toBeNull()
  })

  it('requires type-to-confirm-by-client-id only for delete', () => {
    expect(CLIENT_ACTIONS.delete.confirmByClientId).toBe(true)
    for (const id of ['activate', 'disable', 'decommission'] as ClientActionId[])
      expect(CLIENT_ACTIONS[id].confirmByClientId).toBe(false)
  })

  it('binds each action to the statuses it applies to', () => {
    expect(CLIENT_ACTIONS.activate.appliesTo).toEqual(['staged'])
    expect(CLIENT_ACTIONS.disable.appliesTo).toEqual(['active'])
    expect(CLIENT_ACTIONS.decommission.appliesTo).toEqual(['active', 'disabled'])
    expect(CLIENT_ACTIONS.delete.appliesTo).toEqual([
      'active',
      'staged',
      'disabled',
      'decommissioned',
    ])
  })

  it('every id is its own key (no descriptor drift)', () => {
    for (const id of Object.keys(CLIENT_ACTIONS) as ClientActionId[])
      expect(CLIENT_ACTIONS[id].id).toBe(id)
  })

  it('reuses the generic isReasonValid helper for the optional reason policy', () => {
    expect(isReasonValid(CLIENT_ACTIONS.disable.reason, '')).toBe(true) // optional → empty OK
    expect(isReasonValid(CLIENT_ACTIONS.disable.reason, 'x'.repeat(256))).toBe(false) // > max
    expect(isReasonValid(CLIENT_ACTIONS.delete.reason, '')).toBe(true) // null policy → always valid
  })
})
