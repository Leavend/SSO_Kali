import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'

describe('usePrivilegedAction', () => {
  it('4.1 — allowed success path: returns data, status success, never stuck submitting', async () => {
    const action = usePrivilegedAction<{ ok: boolean }>()
    expect(action.status.value).toBe('idle')

    const promise = action.run(async () => ({ ok: true }))
    expect(action.isSubmitting.value).toBe(true) // submitting while in-flight

    const result = await promise
    expect(result).toEqual({ ok: true })
    expect(action.status.value).toBe('success')
    expect(action.isSubmitting.value).toBe(false)
    expect(action.failure.value).toBeNull()
  })

  it('4.6/4.9 — failure returns null, maps status, exposes field errors + correlation', async () => {
    const action = usePrivilegedAction()
    const result = await action.run(async () => {
      throw new ApiError(
        422,
        'invalid',
        'validation_failed',
        { errors: { email: ['Taken.'] }, audit_event_id: 'evt_1' },
        'req_1',
      )
    })

    expect(result).toBeNull()
    expect(action.status.value).toBe('invalid')
    expect(action.fieldErrors.value.email).toEqual(['Taken.'])
    expect(action.requestId.value).toBe('req_1')
    expect(action.auditEventId.value).toBe('evt_1')
  })

  it('4.7 — step-up failure exposes stepUpUrl', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(428, 'reauth', 'reauth_required', { step_up_url: '/auth/login' })
    })
    expect(action.status.value).toBe('step_up_required')
    expect(action.stepUpUrl.value).toBe('/auth/login')
  })

  it('4.10 — after an error the runner leaves NO stale loading/disabled flag', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(500, 'boom')
    })
    expect(action.status.value).toBe('error')
    expect(action.isSubmitting.value).toBe(false)
  })

  it('reset() clears the action back to idle', async () => {
    const action = usePrivilegedAction()
    await action.run(async () => {
      throw new ApiError(403, 'no')
    })
    expect(action.status.value).toBe('forbidden')
    action.reset()
    expect(action.status.value).toBe('idle')
    expect(action.failure.value).toBeNull()
  })
})
