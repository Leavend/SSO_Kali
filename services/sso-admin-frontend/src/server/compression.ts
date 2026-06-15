/**
 * Edge-side compression safety net for the sso-admin-frontend BFF.
 *
 * Mirrors the sso-frontend BFF compression strategy. See the portal's
 * compression.ts for the full rationale. Production compression is
 * handled by the Traefik `edge-compress` middleware (file provider in
 * infra/traefik/dynamic-compress.yml); this module is the safety net
 * for direct-localhost and test code paths.
 *
 * Invariants (ISS-PERF1):
 *   1. Never compress when an upstream header already sets `Content-Encoding`.
 *   2. Always set `Vary: Accept-Encoding` to keep caches correct.
 *   3. Skip compression for assets < 1024 bytes (CPU cost > bandwidth saving).
 *   4. Skip compression for already-compressed MIME types (images, woff2).
 *   5. Cache the gzipped bytes per absolute path; never re-gzip identical
 *      bytes across requests.
 */

import { createReadStream, readFileSync, type ReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createGzip, gzipSync } from 'node:zlib'

const MIN_COMPRESS_BYTES = 1024

/**
 * Module-level cache of gzipped asset bytes, keyed on absolute path.
 * Vite's production build emits content-hashed filenames
 * (e.g. /assets/index-a1b2c3.js), so each key corresponds to exactly one
 * immutable revision of the file. Entries are invalidated by mtimeMs.
 */
interface GzipCacheEntry {
  readonly buffer: Buffer
  readonly mtimeMs: number
}
const gzipCache = new Map<string, GzipCacheEntry>()

export interface CompressionDecision {
  readonly apply: boolean
  readonly headers: Readonly<Record<string, string>>
  readonly reason: string
  /**
   * Source file mtime in milliseconds (epoch). Populated whenever the
   * `stat()` call inside `decideCompression` succeeds. The caller uses
   * this to invalidate the in-memory gzip cache if the asset on disk has
   * been replaced.
   */
  readonly mtimeMs?: number
}

export async function decideCompression(
  request: IncomingMessage,
  response: ServerResponse,
  absolutePath: string,
  mimeType: string,
): Promise<CompressionDecision> {
  // 1. Never double-compress — respect upstream encoding.
  const headers = response.getHeaders() as Record<string, string | string[]>
  const existingEncoding = pickFirst(headers['content-encoding'])
  if (existingEncoding) {
    return {
      apply: false,
      headers: { 'Vary': 'Accept-Encoding' },
      reason: 'upstream-already-encoded',
    }
  }

  // 2. Only compress text-y MIME types.
  if (!isCompressibleMime(mimeType)) {
    return {
      apply: false,
      headers: { 'Vary': 'Accept-Encoding' },
      reason: 'mime-not-compressible',
    }
  }

  // 3. stat() once; both `size` and `mtimeMs` come from the same handle.
  let size: number
  let mtimeMs: number
  try {
    const stats = await stat(absolutePath)
    size = stats.size
    mtimeMs = stats.mtimeMs
  } catch {
    return {
      apply: false,
      headers: { 'Vary': 'Accept-Encoding' },
      reason: 'stat-failed',
    }
  }
  if (size < MIN_COMPRESS_BYTES) {
    return {
      apply: false,
      headers: { 'Vary': 'Accept-Encoding' },
      reason: 'size-too-small',
      mtimeMs,
    }
  }

  // 4. Negotiate encoding. We only support gzip here; brotli is the edge's job.
  const acceptEncoding = (request.headers['accept-encoding'] ?? '').toLowerCase()
  if (!acceptEncoding.includes('gzip')) {
    return {
      apply: false,
      headers: { 'Vary': 'Accept-Encoding' },
      reason: 'no-gzip-accept',
      mtimeMs,
    }
  }

  return {
    apply: true,
    headers: {
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding',
    },
    reason: 'gzip-negotiated',
    mtimeMs,
  }
}

/**
 * Load the gzipped bytes for `absolutePath`, computing and caching them on
 * first use. Returns the raw (already-gzipped) `Buffer` plus its size so the
 * caller can set `Content-Length` deterministically.
 *
 * Callers MUST gate this on `decideCompression(...).apply === true` and
 * `isCompressibleExtension(...)` before writing the body.
 */
export function loadGzippedAsset(
  absolutePath: string,
  mtimeMs: number,
): { readonly buffer: Buffer; readonly size: number } {
  const cached = gzipCache.get(absolutePath)
  if (cached && cached.mtimeMs === mtimeMs) {
    return { buffer: cached.buffer, size: cached.buffer.length }
  }

  const raw = readFileSync(absolutePath)
  const gzipped = gzipSync(raw, { level: 6 })
  gzipCache.set(absolutePath, { buffer: gzipped, mtimeMs })
  return { buffer: gzipped, size: gzipped.length }
}

/**
 * Clear the in-memory gzip cache. Intended for tests and for hot-reload
 * hooks if we ever need to invalidate every entry at once (the
 * mtime-based invalidation in `loadGzippedAsset` is normally sufficient).
 */
export function purgeGzipCache(): void {
  gzipCache.clear()
}

/**
 * @deprecated Prefer {@link loadGzippedAsset} for cached, buffer-based
 * delivery. Kept for backwards compatibility but recomputes gzip per call.
 */
export function streamCompressedAsset(absolutePath: string): ReadStream {
  const source = createReadStream(absolutePath)
  return source.pipe(createGzip()) as unknown as ReadStream
}

function isCompressibleMime(mimeType: string): boolean {
  const bare = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!bare) return false
  if (bare.startsWith('text/')) return true
  if (bare === 'application/javascript') return true
  if (bare === 'application/json') return true
  if (bare === 'application/xml') return true
  if (bare === 'image/svg+xml') return true
  return false
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export function isCompressibleExtension(pathname: string): boolean {
  const idx = pathname.lastIndexOf('.')
  if (idx === -1) return false
  const ext = pathname.slice(idx).toLowerCase()
  return (
    ext === '.html' ||
    ext === '.js' ||
    ext === '.mjs' ||
    ext === '.css' ||
    ext === '.json' ||
    ext === '.svg' ||
    ext === '.txt' ||
    ext === '.xml'
  )
}
