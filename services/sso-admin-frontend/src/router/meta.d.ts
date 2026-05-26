import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    readonly requiresAdmin?: boolean
    readonly permissions?: readonly string[]
  }
}
