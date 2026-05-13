import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logger.error outputs to console.error', () => {
    logger.error('Something broke', { component: 'LoginPage' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('Something broke')
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('ERROR')
  })

  it('logger.warn outputs to console.warn', () => {
    logger.warn('Deprecation notice')
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect((console.warn as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('WARN')
  })

  it('logger.info outputs to console.info in dev mode', () => {
    logger.info('User logged in', { userId: 42 })
    expect(console.info).toHaveBeenCalledTimes(1)
    expect((console.info as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('INFO')
    expect((console.info as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('42')
  })

  it('logger.debug outputs to console.debug in dev mode', () => {
    logger.debug('PKCE verifier generated', { length: 43 })
    expect(console.debug).toHaveBeenCalledTimes(1)
    expect((console.debug as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('DEBUG')
  })

  it('captureException logs error with stack', () => {
    const error = new Error('Network timeout')
    logger.captureException(error, { endpoint: '/api/auth/session' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('Network timeout')
  })

  it('captureException handles non-Error values', () => {
    logger.captureException('raw string error')
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('raw string error')
  })

  it('setUser does not throw when Sentry is not available', () => {
    expect(() => logger.setUser({ id: 1, email: 'a@b.com', subject_id: 'sub-1' })).not.toThrow()
    expect(() => logger.setUser(null)).not.toThrow()
  })

  it('includes ISO timestamp in output', () => {
    logger.warn('test timestamp')
    const output = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    // ISO format: 2026-05-11T...
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
  })

  it('includes context as JSON in output', () => {
    logger.error('fail', { requestId: 'abc-123', status: 500 })
    const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(output).toContain('"requestId":"abc-123"')
    expect(output).toContain('"status":500')
  })
})
