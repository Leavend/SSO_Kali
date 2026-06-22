import { describe, expect, it } from 'vitest'
import {
  createInitialRoutePreloadLinks,
  resolveInitialRouteManifestKey,
  type ViteManifest,
} from '../preload-links.js'

const manifest: ViteManifest = {
  'src/main.ts': {
    file: 'assets/index.js',
    isEntry: true,
  },
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
  },
  '_vue.runtime.js': {
    file: 'assets/vue.runtime.js',
  },
  'src/features/dashboard/pages/DashboardPage.vue': {
    file: 'assets/dashboard.js',
    imports: ['_shared'],
  },
  'src/features/clients/pages/ClientsPage.vue': {
    file: 'assets/clients.js',
    imports: ['_vue.runtime.js', 'index.html', '_shared'],
  },
  'src/features/clients/pages/ClientCreatePage.vue': {
    file: 'assets/client-create.js',
    imports: ['_shared'],
  },
  'src/features/observability/pages/AuditObservabilityPage.vue': {
    file: 'assets/observability.js',
    imports: ['_shared'],
  },
  'src/features/audit/pages/AuditPage.vue': {
    file: 'assets/audit-compliance.js',
    imports: ['_shared'],
  },
  _shared: {
    file: 'assets/shared.js',
  },
}

describe('admin shell route preloads', () => {
  it('maps the initial request path to the lazy route component manifest key', () => {
    expect(resolveInitialRouteManifestKey('/')).toBe(
      'src/features/dashboard/pages/DashboardPage.vue',
    )
    expect(resolveInitialRouteManifestKey('/dashboard')).toBe(
      'src/features/dashboard/pages/DashboardPage.vue',
    )
    expect(resolveInitialRouteManifestKey('/clients')).toBe(
      'src/features/clients/pages/ClientsPage.vue',
    )
    expect(resolveInitialRouteManifestKey('/clients/new')).toBe(
      'src/features/clients/pages/ClientCreatePage.vue',
    )
    expect(resolveInitialRouteManifestKey('/observability')).toBe(
      'src/features/observability/pages/AuditObservabilityPage.vue',
    )
    expect(resolveInitialRouteManifestKey('/observability/compliance')).toBe(
      'src/features/audit/pages/AuditPage.vue',
    )
  })

  it('emits route chunk modulepreload links before the SPA bootstrap runs', () => {
    expect(createInitialRoutePreloadLinks('/clients', manifest)).toBe(
      '<link rel="modulepreload" crossorigin href="/assets/clients.js">\n' +
        '<link rel="modulepreload" crossorigin href="/assets/shared.js">',
    )
  })

  it('honors a deployed base path and skips unknown fallback routes', () => {
    expect(createInitialRoutePreloadLinks('/clients/new', manifest, '/admin/')).toContain(
      'href="/admin/assets/client-create.js"',
    )
    expect(createInitialRoutePreloadLinks('/does-not-exist', manifest)).toBe('')
  })
})
