import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStepUpLoginUrl, triggerStepUpReauth } from '../stepup'

describe('step-up re-authentication helper', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a prompt-login URL with the current path as return target', () => {
    expect(buildStepUpLoginUrl(undefined, fakeLocation('/clients/new', '?tab=secrets', '#rotate'))).toBe(
      'https://admin.example.test/auth/login?prompt=login&max_age=0&return_to=%2Fclients%2Fnew%3Ftab%3Dsecrets%23rotate',
    )
  })

  it('redirects in normal runtime even when the E2E mock env var is present', () => {
    vi.stubEnv('VITE_SSO_ENABLE_STEPUP_E2E_MOCK', 'true')
    const location = fakeLocation('/policy')

    triggerStepUpReauth('/policy', location)

    expect(location.href).toBe(
      'https://admin.example.test/auth/login?prompt=login&max_age=0&return_to=%2Fpolicy',
    )
  })

  it('suppresses redirects only for the build-time E2E mock mode', () => {
    vi.stubEnv('MODE', 'e2e')
    vi.stubEnv('VITE_SSO_ENABLE_STEPUP_E2E_MOCK', 'true')
    const location = fakeLocation('/sessions')

    triggerStepUpReauth('/sessions', location)

    expect(location.href).toBe('https://admin.example.test/sessions')
  })

  it('redirects in E2E mode when the explicit mock flag is not enabled', () => {
    vi.stubEnv('MODE', 'e2e')
    const location = fakeLocation('/sessions')

    triggerStepUpReauth('/sessions', location)

    expect(location.href).toBe(
      'https://admin.example.test/auth/login?prompt=login&max_age=0&return_to=%2Fsessions',
    )
  })
})

function fakeLocation(pathname: string, search = '', hash = ''): Location {
  return {
    hash,
    href: `https://admin.example.test${pathname}${search}${hash}`,
    origin: 'https://admin.example.test',
    pathname,
    search,
  } as Location
}
