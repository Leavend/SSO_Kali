import { describe, expect, it } from 'vitest'
import {
  CLIENTS_PAGE_SIZE,
  clientsPageCount,
  filterClients,
  mergeClients,
  paginateClients,
} from '../clients-list'
import type { AdminClientListItem, ClientRegistration } from '@/types/clients.types'

// A single fully-typed sample row; overrides keep each case readable. The DTO
// carries only `has_secret_hash` — never a `client_secret` — matching the live
// masked contract; fixtures read clearly as samples.
const base: AdminClientListItem = {
  client_id: 'portal-web',
  display_name: 'Portal Web',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://portal.example.test',
  redirect_uris: ['https://portal.example.test/auth/callback'],
  post_logout_redirect_uris: ['https://portal.example.test/'],
  allowed_scopes: ['openid', 'profile', 'email'],
  backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'publik',
  has_secret_hash: true,
}

function makeClient(overrides: Partial<AdminClientListItem>): AdminClientListItem {
  return { ...base, ...overrides }
}

function makeRegistration(overrides: Partial<ClientRegistration>): ClientRegistration {
  return {
    client_id: 'portal-web',
    display_name: 'Portal Web (registration)',
    type: 'confidential',
    environment: 'live',
    app_base_url: 'https://portal.example.test',
    redirect_uris: ['https://portal.example.test/auth/callback'],
    post_logout_redirect_uris: ['https://portal.example.test/'],
    backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
    allowed_scopes: ['openid', 'profile', 'email'],
    owner_email: 'registry-owner@example.test',
    provisioning: 'jit',
    status: 'active',
    has_secret_hash: true,
    ...overrides,
  }
}

describe('mergeClients', () => {
  it('overlays runtime onto a registration per-field, but a null runtime field keeps the registration value', () => {
    const registrations = [
      makeRegistration({
        client_id: 'portal-web',
        display_name: 'Portal Web (registration)',
        type: 'confidential',
        owner_email: 'registry-owner@example.test',
        backchannel_logout_uri: 'https://portal.example.test/auth/backchannel/logout',
      }),
    ]
    const runtime = [
      makeClient({
        client_id: 'portal-web',
        display_name: null,
        type: null,
        owner_email: null,
        backchannel_logout_uri: null,
        status: 'active',
      }),
    ]

    const merged = mergeClients(runtime, registrations)

    expect(merged).toHaveLength(1)
    // null runtime fields fall back to the registration — the parity-critical guarantee.
    expect(merged[0]?.display_name).toBe('Portal Web (registration)')
    expect(merged[0]?.type).toBe('confidential')
    expect(merged[0]?.owner_email).toBe('registry-owner@example.test')
    expect(merged[0]?.backchannel_logout_uri).toBe(
      'https://portal.example.test/auth/backchannel/logout',
    )
  })

  it('prefers a present runtime field over the registration value', () => {
    const registrations = [makeRegistration({ client_id: 'portal-web', status: 'staged' })]
    const runtime = [
      makeClient({ client_id: 'portal-web', display_name: 'Portal Web (live)', status: 'active' }),
    ]

    const merged = mergeClients(runtime, registrations)

    expect(merged[0]?.display_name).toBe('Portal Web (live)')
    expect(merged[0]?.status).toBe('active')
  })

  it('retains registration-only (staged) clients that have no runtime row', () => {
    const registrations = [
      makeRegistration({
        client_id: 'analytics-staged',
        display_name: 'Analytics (staged)',
        status: 'staged',
      }),
    ]
    const runtime: readonly AdminClientListItem[] = []

    const merged = mergeClients(runtime, registrations)

    expect(merged.map((c) => c.client_id)).toEqual(['analytics-staged'])
    expect(merged[0]?.status).toBe('staged')
  })

  it('keeps runtime-only clients that have no registration row', () => {
    const runtime = [makeClient({ client_id: 'admin-console', display_name: 'Admin Console' })]

    const merged = mergeClients(runtime, [])

    expect(merged.map((c) => c.client_id)).toEqual(['admin-console'])
    expect(merged[0]?.display_name).toBe('Admin Console')
  })

  it('keeps registration-defined fields the runtime DTO never carries (category survives)', () => {
    // Registration has no `category`; it must come from the runtime overlay and not be lost.
    const registrations = [makeRegistration({ client_id: 'staff-app' })]
    const runtime = [makeClient({ client_id: 'staff-app', category: 'kepegawaian' })]

    const merged = mergeClients(runtime, registrations)

    expect(merged[0]?.category).toBe('kepegawaian')
  })

  it('never introduces a client_secret onto a merged row (only has_secret_hash)', () => {
    const merged = mergeClients([makeClient({})], [makeRegistration({})])
    const row = merged[0] as Record<string, unknown>
    expect('client_secret' in row).toBe(false)
    expect('clientSecret' in row).toBe(false)
    expect(row.has_secret_hash).toBe(true)
  })
})

const sample: readonly AdminClientListItem[] = [
  makeClient({ client_id: 'portal-web', display_name: 'Portal Web', status: 'active' }),
  makeClient({ client_id: 'admin-console', display_name: 'Admin Console', status: 'active' }),
  makeClient({ client_id: 'analytics-staged', display_name: 'Analytics', status: 'staged' }),
  makeClient({ client_id: 'legacy-app', display_name: null, status: 'disabled' }),
]

describe('filterClients', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterClients(sample, { query: '', status: 'all' })).toHaveLength(4)
    expect(filterClients(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches case-insensitively across display_name and client_id', () => {
    expect(
      filterClients(sample, { query: 'PORTAL', status: 'all' }).map((c) => c.client_id),
    ).toEqual(['portal-web'])
    expect(
      filterClients(sample, { query: 'analytics-staged', status: 'all' }).map((c) => c.client_id),
    ).toEqual(['analytics-staged'])
  })

  it('does not crash on a null display_name and still matches by client_id', () => {
    expect(
      filterClients(sample, { query: 'legacy-app', status: 'all' }).map((c) => c.client_id),
    ).toEqual(['legacy-app'])
  })

  it('filters by status', () => {
    expect(filterClients(sample, { query: '', status: 'staged' }).map((c) => c.client_id)).toEqual([
      'analytics-staged',
    ])
    expect(
      filterClients(sample, { query: '', status: 'disabled' }).map((c) => c.client_id),
    ).toEqual(['legacy-app'])
  })

  it('combines query and status (AND)', () => {
    expect(filterClients(sample, { query: 'portal', status: 'staged' })).toHaveLength(0)
    expect(filterClients(sample, { query: 'analytics', status: 'staged' })).toHaveLength(1)
  })
})

describe('paginateClients', () => {
  const many: readonly AdminClientListItem[] = Array.from({ length: 30 }, (_, i) =>
    makeClient({ client_id: `client-${i}`, display_name: `Client ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateClients(many, 1)).toHaveLength(CLIENTS_PAGE_SIZE)
    expect(paginateClients(many, 2)).toHaveLength(30 - CLIENTS_PAGE_SIZE)
    expect(paginateClients(many, 1)[0]?.client_id).toBe('client-0')
    expect(paginateClients(many, 2)[0]?.client_id).toBe(`client-${CLIENTS_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateClients(many, 1, 10)).toHaveLength(10)
    expect(paginateClients(many, 0, 10)[0]?.client_id).toBe('client-0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateClients(many, 99)).toEqual([])
  })
})

describe('clientsPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(clientsPageCount(0)).toBe(1)
    expect(clientsPageCount(25)).toBe(1)
    expect(clientsPageCount(26)).toBe(2)
    expect(clientsPageCount(50)).toBe(2)
    expect(clientsPageCount(51)).toBe(3)
    expect(clientsPageCount(10, 10)).toBe(1)
    expect(clientsPageCount(11, 10)).toBe(2)
  })
})
