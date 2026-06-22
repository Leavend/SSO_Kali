type BrowserLocation = Pick<Location, 'hash' | 'href' | 'origin' | 'pathname' | 'search'>

export function buildStepUpLoginUrl(
  returnTo?: string,
  location: BrowserLocation = window.location,
): string {
  const url = new URL('/auth/login', location.origin)
  url.searchParams.set('prompt', 'login')
  url.searchParams.set('max_age', '0')
  url.searchParams.set('return_to', returnTo ?? currentLocationPath(location))
  return url.toString()
}

export function triggerStepUpReauth(
  returnTo?: string,
  location: BrowserLocation = window.location,
): void {
  if (isE2eStepUpMockEnabled()) {
    return
  }
  location.href = buildStepUpLoginUrl(returnTo, location)
}

function isE2eStepUpMockEnabled(): boolean {
  return (
    import.meta.env.MODE === 'e2e' && import.meta.env.VITE_SSO_ENABLE_STEPUP_E2E_MOCK === 'true'
  )
}

function currentLocationPath(location: BrowserLocation): string {
  return location.pathname + location.search + location.hash
}
