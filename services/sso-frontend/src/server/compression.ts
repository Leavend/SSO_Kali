/**
 * Edge-side compression safety net for the sso-frontend BFF.
 *
 * In production the Traefik edge proxy (started via
 * infra/traefik/docker-compose.chained.override.yml) compresses assets through
 * the `edge-compress` file-provider middleware, which negotiates
 * gzip + brotli + zstd per request. See `infra/traefik/dynamic-compress.yml`.
 *
 * This module is the safety net for paths that bypass Traefik:
 *   - local dev (vite preview, vitest)
 *   - container-to-container traffic on 127.0.0.1 inside the VPS
 *   - anything that reaches the BFF directly without going through the
 *     edge proxy.
 *
 * It negotiates `Accept-Encoding`, respects upstream `Vary` markers, and
 * serves the pre-gzipped asset from an in-memory cache keyed on the
 * absolute path. We intentionally do NOT re-gzip on every request:
 * immutable Vite assets have content-hashed names so the cache is
 * effectively unbounded-per-asset, and recompressing the same bytes on
 * every cache miss is the very thing the audit (ISS-PERF1) called out
 * as wasteful.
 *
 * Invariants (ISS-PERF1):
 *   1. Never compress when an upstream header already sets `Content-Encoding`.
 *   2. Always set `Vary: Accept-Encoding` to keep caches correct.
 *   3. Skip compression for assets < 1024 bytes (CPU cost > bandwidth saving).
 *   4. Skip compression for already-compressed MIME types (images, woff2).
 *   5. Cache the gzipped bytes per absolute path; never re-gzip identical
 *      bytes across requests.
 */

import { createReadStream, type ReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createGzip, gzipSync } from "node:zlib";

const MIN_COMPRESS_BYTES = 1024;

const COMPRESSIBLE_EXTENSIONS = new Set([
	".html",
	".js",
	".mjs",
	".css",
	".json",
	".svg",
	".txt",
	".xml",
]);

/**
 * Module-level cache of gzipped asset bytes, keyed on absolute path.
 *
 * Vite's production build emits content-hashed filenames
 * (e.g. /assets/index-a1b2c3.js), so each key corresponds to exactly one
 * immutable revision of the file. The cache is sized by the number of
 * distinct assets served during the lifetime of the Node process — for a
 * typical SPA that's a few dozen entries totalling a few MB. We do not
 * LRU-evict: the working set is bounded by the build output.
 *
 * Each entry stores the gzipped buffer alongside the source mtimeMs so
 * stale entries (e.g. during a hot-reload of the client/ dir) are
 * transparently recomputed on the next request. In production the
 * content-hashed filenames make this a no-op.
 */
interface GzipCacheEntry {
	readonly buffer: Buffer;
	readonly mtimeMs: number;
}
const gzipCache = new Map<string, GzipCacheEntry>();

export interface CompressionDecision {
	readonly apply: boolean;
	readonly headers: Readonly<Record<string, string>>;
	readonly reason: string;
	/**
	 * Source file mtime in milliseconds (epoch). Populated whenever the
	 * `stat()` call inside `decideCompression` succeeds (i.e. for every
	 * decision except `stat-failed`). The caller uses this to invalidate
	 * the in-memory gzip cache if the asset on disk has been replaced.
	 */
	readonly mtimeMs?: number;
}

/**
 * Decide whether to compress a static asset response and produce the headers.
 *
 * The returned `headers` MUST only be merged into the outgoing response
 * headers when the caller is actually going to send a gzipped body (see
 * `server/index.ts` for the single-gate pattern). This module keeps the
 * `apply` flag and the body-only `Content-Encoding` header in lockstep by
 * always emitting `Content-Encoding` together with `apply: true`.
 *
 * @param request     Incoming HTTP request (for Accept-Encoding).
 * @param response    Outgoing HTTP response (checked for existing headers).
 * @param absolutePath Filesystem path of the asset to serve.
 * @param mimeType    Resolved Content-Type for the asset.
 */
export async function decideCompression(
	request: IncomingMessage,
	response: ServerResponse,
	absolutePath: string,
	mimeType: string,
): Promise<CompressionDecision> {
	// 1. Never double-compress — respect upstream encoding.
	const headers = response.getHeaders() as Record<string, string | string[]>;
	const existingEncoding = pickFirst(headers["content-encoding"]);
	if (existingEncoding) {
		return {
			apply: false,
			headers: { Vary: "Accept-Encoding" },
			reason: "upstream-already-encoded",
		};
	}

	// 2. Only compress text-y MIME types.
	if (!isCompressibleMime(mimeType)) {
		return {
			apply: false,
			headers: { Vary: "Accept-Encoding" },
			reason: "mime-not-compressible",
		};
	}

	// 3. stat() once; both `size` and `mtimeMs` come from the same handle so
	// we never race against a file replacement between checks.
	let size: number;
	let mtimeMs: number;
	try {
		const stats = await stat(absolutePath);
		size = stats.size;
		mtimeMs = stats.mtimeMs;
	} catch {
		return {
			apply: false,
			headers: { Vary: "Accept-Encoding" },
			reason: "stat-failed",
		};
	}
	if (size < MIN_COMPRESS_BYTES) {
		return {
			apply: false,
			headers: { Vary: "Accept-Encoding" },
			reason: "size-too-small",
			mtimeMs,
		};
	}

	// 4. Negotiate encoding. We only support gzip here; brotli is the edge's job.
	const acceptEncoding = (
		request.headers["accept-encoding"] ?? ""
	).toLowerCase();
	if (!acceptEncoding.includes("gzip")) {
		return {
			apply: false,
			headers: { Vary: "Accept-Encoding" },
			reason: "no-gzip-accept",
			mtimeMs,
		};
	}

	return {
		apply: true,
		headers: {
			"Content-Encoding": "gzip",
			Vary: "Accept-Encoding",
		},
		reason: "gzip-negotiated",
		mtimeMs,
	};
}

/**
 * Load the gzipped bytes for `absolutePath`, computing and caching them on
 * first use. Returns the raw (already-gzipped) `Buffer` plus its size so the
 * caller can set `Content-Length` deterministically.
 *
 * Callers MUST gate this on `decideCompression(...).apply === true` and
 * `isCompressibleExtension(...)` before writing the body.
 *
 * Synchronous on purpose: the only call sites (server/index.ts) invoke this
 * exactly once per request, after `decideCompression` has already done the
 * `stat()` size check, and the result is either served from the in-memory
 * cache or computed once-and-cached. We deliberately avoid the on-the-fly
 * `createReadStream().pipe(createGzip())` pattern that the audit
 * (ISS-PERF1) called out as wasteful.
 */
export function loadGzippedAsset(
	absolutePath: string,
	mtimeMs: number,
): { readonly buffer: Buffer; readonly size: number } {
	const cached = gzipCache.get(absolutePath);
	if (cached && cached.mtimeMs === mtimeMs) {
		return { buffer: cached.buffer, size: cached.buffer.length };
	}

	// Cache miss or stale entry: read the source bytes, gzip once, memoize.
	const raw = readFileSync(absolutePath);
	const gzipped = gzipSync(raw, { level: 6 });
	gzipCache.set(absolutePath, { buffer: gzipped, mtimeMs });
	return { buffer: gzipped, size: gzipped.length };
}

/**
 * Clear the in-memory gzip cache. Intended for tests and for hot-reload
 * hooks if we ever need to invalidate every entry at once (in practice
 * the mtime-based invalidation in `loadGzippedAsset` is sufficient).
 */
export function purgeGzipCache(): void {
	gzipCache.clear();
}

/**
 * @deprecated Prefer {@link loadGzippedAsset} for cached, buffer-based
 * delivery. This streaming helper is kept for backwards compatibility with
 * callers that still need a `ReadStream`, but it recomputes gzip per call
 * and should not be used in the hot path.
 */
export function streamCompressedAsset(absolutePath: string): ReadStream {
	const source = createReadStream(absolutePath);
	return source.pipe(createGzip()) as unknown as ReadStream;
}

function isCompressibleMime(mimeType: string): boolean {
	// Match the bare Content-Type without charset parameter.
	const bare = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!bare) return false;
	if (bare.startsWith("text/")) return true;
	if (bare === "application/javascript") return true;
	if (bare === "application/json") return true;
	if (bare === "application/xml") return true;
	if (bare === "image/svg+xml") return true;
	return false;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) return value[0];
	return value;
}

export function isCompressibleExtension(pathname: string): boolean {
	const idx = pathname.lastIndexOf(".");
	if (idx === -1) return false;
	return COMPRESSIBLE_EXTENSIONS.has(pathname.slice(idx).toLowerCase());
}
