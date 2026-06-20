import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

// Keep this helper in sync with services/sso-frontend/src/server/http-cache.ts.
export function createEntityTag(body: string | Buffer): string {
  return `W/"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`
}

export function requestHasMatchingEtag(request: IncomingMessage, etag: string): boolean {
  const ifNoneMatch = request.headers['if-none-match']
  if (!ifNoneMatch) return false

  const candidates = Array.isArray(ifNoneMatch) ? ifNoneMatch : ifNoneMatch.split(',')

  return candidates.some((candidate) => candidate.trim() === '*' || candidate.trim() === etag)
}
