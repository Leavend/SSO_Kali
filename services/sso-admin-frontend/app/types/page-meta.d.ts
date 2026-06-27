declare module '#app' {
  interface PageMeta {
    requiresAdmin?: boolean
    permissions?: readonly string[]
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    requiresAdmin?: boolean
    permissions?: readonly string[]
  }
}

export {}
