/**
 * JWKS-based ID Token signature verification (FR-002 / UC-23 / UC-31).
 *
 * Uses native WebCrypto API (crypto.subtle) to verify ES256 signatures —
 * no external dependency, zero bundle cost.
 *
 * Security rationale:
 *   - Signature verification is the final trust boundary between the SPA
 *     and the SSO server. Even though the token was fetched from a trusted
 *     origin over TLS, verifying the signature proves the payload was
 *     issued by the holder of the signing private key.
 *   - JWKS is fetched from the configured issuer's jwks_uri. The response
 *     is cached in-memory for `JWKS_CACHE_TTL_MS` to avoid refetch on
 *     every token validation.
 *   - ETag-aware refetch honors the backend's 304 Not Modified response,
 *     aligning with FR-002 Issue #1.
 */

export type JwkEc = {
  readonly kty: 'EC'
  readonly crv: string
  readonly x: string
  readonly y: string
  readonly kid?: string
  readonly alg?: string
  readonly use?: string
}

export type JwksResponse = {
  readonly keys: readonly JwkEc[]
}

export class JwksFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JwksFetchError'
  }
}

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureVerificationError'
  }
}

type CacheEntry = {
  readonly keys: readonly JwkEc[]
  readonly etag: string | null
  readonly fetchedAt: number
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000 // Align with backend JWT_JWKS_CACHE_TTL_SECONDS=300
const JWKS_COOLDOWN_MS = 30 * 1000

const cache = new Map<string, CacheEntry>()
const pendingFetches = new Map<string, Promise<CacheEntry>>()

/**
 * Fetch JWKS from the given URL with ETag-aware caching.
 * Returns cached keys if still fresh, refetches with If-None-Match otherwise.
 */
export async function fetchJwks(jwksUrl: string): Promise<readonly JwkEc[]> {
  const cached = cache.get(jwksUrl)
  const now = Date.now()

  if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys
  }

  // Deduplicate concurrent fetches (FR-002: cooldownDuration equivalent).
  const pending = pendingFetches.get(jwksUrl)
  if (pending) {
    return (await pending).keys
  }

  const fetchPromise = performFetch(jwksUrl, cached ?? null)
  pendingFetches.set(jwksUrl, fetchPromise)

  try {
    const entry = await fetchPromise
    cache.set(jwksUrl, entry)
    return entry.keys
  } finally {
    pendingFetches.delete(jwksUrl)
  }
}

async function performFetch(jwksUrl: string, previous: CacheEntry | null): Promise<CacheEntry> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (previous?.etag) {
    headers['If-None-Match'] = previous.etag
  }

  let response: Response
  try {
    response = await fetch(jwksUrl, {
      method: 'GET',
      headers,
      credentials: 'omit',
      cache: 'no-cache',
      signal: AbortSignal.timeout(5_000),
    })
  } catch (err) {
    throw new JwksFetchError(`JWKS request failed: ${err instanceof Error ? err.message : 'network error'}`)
  }

  // 304 Not Modified — keys unchanged, refresh timestamp only.
  if (response.status === 304 && previous) {
    return { keys: previous.keys, etag: previous.etag, fetchedAt: Date.now() }
  }

  if (!response.ok) {
    throw new JwksFetchError(`JWKS endpoint returned HTTP ${response.status}`)
  }

  let payload: JwksResponse
  try {
    payload = (await response.json()) as JwksResponse
  } catch {
    throw new JwksFetchError('JWKS response is not valid JSON.')
  }

  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new JwksFetchError('JWKS response does not contain any keys.')
  }

  return {
    keys: payload.keys,
    etag: response.headers.get('ETag'),
    fetchedAt: Date.now(),
  }
}

/**
 * Verify an ES256 signature of a JWT against a JWKS set.
 *
 * @param token - Full JWT string (header.payload.signature)
 * @param keys  - JWKS key array
 * @returns true if signature is valid and matches one of the keys
 */
export async function verifyJwtSignature(token: string, keys: readonly JwkEc[]): Promise<boolean> {
  const segments = token.split('.')
  if (segments.length !== 3) {
    throw new SignatureVerificationError('Malformed JWT.')
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string]

  let header: { readonly alg?: string; readonly kid?: string }
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64)) as typeof header
  } catch {
    throw new SignatureVerificationError('Invalid JWT header.')
  }

  if (header.alg !== 'ES256') {
    throw new SignatureVerificationError(`Unsupported algorithm: ${String(header.alg)}`)
  }

  const candidateKey = selectKey(keys, header.kid)
  if (!candidateKey) {
    throw new SignatureVerificationError(`No matching JWKS key found for kid="${String(header.kid)}".`)
  }

  const cryptoKey = await importEcPublicKey(candidateKey)
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64UrlDecode(signatureB64)

  // ES256 raw signature is 64 bytes: r (32) || s (32)
  if (signature.byteLength !== 64) {
    throw new SignatureVerificationError('Invalid ES256 signature length.')
  }

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    signature,
    signedData,
  )
}

function selectKey(keys: readonly JwkEc[], kid: string | undefined): JwkEc | undefined {
  if (kid) {
    return keys.find((k) => k.kid === kid)
  }
  // No kid in header — fall back to first signing key (tolerates single-key setups).
  return keys.find((k) => k.use === 'sig' || k.use === undefined)
}

async function importEcPublicKey(jwk: JwkEc): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
}

function base64UrlDecode(input: string): ArrayBuffer {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function base64UrlDecodeToString(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')
  return atob(padded)
}

/** Test-only: clear the in-memory JWKS cache. */
export function __clearJwksCacheForTests(): void {
  cache.clear()
  pendingFetches.clear()
}
