import type { PortalSession } from './utils/session'
import type { PortalSessionView } from './utils/types'

declare module 'h3' {
  interface H3EventContext {
    session: PortalSession | null
    principalState: PortalSessionView | null
  }
}

export {}
