/**
 * OIDC Discovery metadata fetcher with ETag-aware caching (FR-003 / UC-01).
 *
 * Mirrors the jwks.ts cache pattern so both well-known endpoints share the
 * same semantics: 5-minute TTL, ETag revalidation, concurrent fetch dedupe.
 *
 * Why cache at the frontend:
 *   - Every OIDC flow (authorize init, token exchange, validation) may
 *     reference Discovery metadata. Without a cache the SPA re-fetches on
 *     each interaction.
 *   - The backend already advertises Cache-Control: public, max-age=300,
 *     but the browser's HTTP cache is not guaranteed (e.g. private mode,
 *     embedded webviews). An explicit in-memory cache ensures consistent
 *     behavior across environments.
 */

export type DiscoveryMetadata = {
  readonly issuer: string
  readonly authorization_endpoint: string
  readonly token_endpoint: string
  readonly userinfo_endpoint?: string
  readonly end_session_endpoint?: string
  readonly revocation_endpoint?: string
  readonly jwks_uri: string
  readonly response_types_supported: readonly string[]
  readonly grant_types_supported?: readonly string[]
  readonly subject_types_supported: readonly string[]
  readonly id_token_signing_alg_values_supported: readonly string[]
  readonly scopes_supported?: readonly string[]
  readonly token_endpoint_auth_methods_supported?: readonly string[]
  readonly code_challenge_methods_supported?: readonly string[]
  readonly claims_supported?: readonly string[]
}

export class DiscoveryFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryFetchError'
  }
}

type CacheEntry = {
  readonly metadata: DiscoveryMetadata
  readonly etag: string | null
  readonly fetchedAt: number
}

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes, aligned with backend Cache-Control.
const DISCOVERY_FETCH_TIMEOUT_MS = 5_000

const cache = new Map<string, CacheEntry>()
const pendingFetches = new Map<string, Promise<CacheEntry>>()

/**
 * Fetch Discovery metadata with ETag-aware caching.
 *
 * @param discoveryUrl - typically `${issuer}/.well-known/openid-configuration`
 */
export async function fetchDiscovery(discoveryUrl: string): Promise<DiscoveryMetadata> {
  const cached = cache.get(discoveryUrl)
  const now = Date.now()

  if (cached && now - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return cached.metadata
  }

  const pending = pendingFetches.get(discoveryUrl)
  if (pending) {
    return (await pending).metadata
  }

  const fetchPromise = performFetch(discoveryUrl, cached ?? null)
  pendingFetches.set(discoveryUrl, fetchPromise)

  try {
    const entry = await fetchPromise
    cache.set(discoveryUrl, entry)
    return entry.metadata
  } finally {
    pendingFetches.delete(discoveryUrl)
  }
}

async function performFetch(url: string, previous: CacheEntry | null): Promise<CacheEntry> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (previous?.etag) {
    headers['If-None-Match'] = previous.etag
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'omit',
      cache: 'no-cache',
      signal: AbortSignal.timeout(DISCOVERY_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new DiscoveryFetchError(
      `Discovery request failed: ${err instanceof Error ? err.message : 'network error'}`,
    )
  }

  if (response.status === 304 && previous) {
    return { metadata: previous.metadata, etag: previous.etag, fetchedAt: Date.now() }
  }

  if (!response.ok) {
    throw new DiscoveryFetchError(`Discovery endpoint returned HTTP ${response.status}`)
  }

  let payload: DiscoveryMetadata
  try {
    payload = (await response.json()) as DiscoveryMetadata
  } catch {
    throw new DiscoveryFetchError('Discovery response is not valid JSON.')
  }

  validateMetadata(payload)

  return {
    metadata: payload,
    etag: response.headers.get('ETag'),
    fetchedAt: Date.now(),
  }
}

function validateMetadata(payload: DiscoveryMetadata): void {
  const required: ReadonlyArray<keyof DiscoveryMetadata> = [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'jwks_uri',
    'response_types_supported',
    'subject_types_supported',
    'id_token_signing_alg_values_supported',
  ]

  for (const field of required) {
    if (!(field in payload) || payload[field] === undefined || payload[field] === null) {
      throw new DiscoveryFetchError(`Discovery metadata missing required field: ${field}`)
    }
  }
}

/** Test-only: clear the in-memory cache. */
export function __clearDiscoveryCacheForTests(): void {
  cache.clear()
  pendingFetches.clear()
}
