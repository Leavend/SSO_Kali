export function buildStepUpLoginUrl(returnTo?: string): string {
  const url = new URL('/auth/login', window.location.origin)
  url.searchParams.set('prompt', 'login')
  url.searchParams.set('max_age', '0')
  url.searchParams.set('return_to', returnTo ?? currentLocationPath())
  return url.toString()
}

export function triggerStepUpReauth(returnTo?: string): void {
  window.location.href = buildStepUpLoginUrl(returnTo)
}

function currentLocationPath(): string {
  return window.location.pathname + window.location.search + window.location.hash
}
