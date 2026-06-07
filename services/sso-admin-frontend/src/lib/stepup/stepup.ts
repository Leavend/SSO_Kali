export function triggerStepUpReauth(): void {
  const url = new URL('/auth/login', window.location.origin)
  url.searchParams.set('prompt', 'login')
  url.searchParams.set('max_age', '0')
  const currentPath = window.location.pathname + window.location.search + window.location.hash
  url.searchParams.set('return_to', currentPath)
  window.location.href = url.toString()
}
