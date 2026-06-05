import { getAdminEnvironment } from '@/config/adminEnvironment'

export function triggerStepUpReauth(): void {
  const env = getAdminEnvironment()
  const url = new URL('/auth/login', window.location.origin)
  url.searchParams.set('prompt', 'login')
  url.searchParams.set('max_age', '0')
  url.searchParams.set('return_to', normalizeReturnPath(env.publicBasePath))
  window.location.href = url.toString()
}

function normalizeReturnPath(basePath: string): string {
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`
  return base.endsWith('/') ? base : `${base}/`
}
