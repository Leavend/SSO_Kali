import { resolveBootstrapFailure, resolveLoadedAdminAccess } from '@/lib/auth/admin-guard-resolver'
import { useSessionStore } from '@/stores/session.store'

export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.meta.requiresAdmin) return

  const session = useSessionStore()

  if (!session.principal) {
    const result = await session.startSessionBootstrap()
    const origin = useRequestURL().origin
    const basePath = useRuntimeConfig().public.basePath
    const resolution = resolveBootstrapFailure(result, to.fullPath, origin, basePath)
    if (resolution.kind === 'login') return navigateTo(resolution.url, { external: true })
    if (resolution.kind === 'route') return navigateTo(resolution.to)
  }

  const access = resolveLoadedAdminAccess(to)
  if (access !== true) return navigateTo(access)
})
