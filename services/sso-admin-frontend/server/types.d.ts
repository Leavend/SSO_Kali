import type { PortalSession } from './utils/session'

declare module 'h3' {
  interface H3EventContext {
    session: PortalSession | null
  }
}

export {}
