import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideCompression, isCompressibleExtension } from '../compression.js'

function requestWithEncoding(value: string | undefined): IncomingMessage {
  const headers: Record<string, string> = {}
  if (value !== undefined) headers['accept-encoding'] = value
  return { headers } as unknown as IncomingMessage
}

function responseWithHeaders(headers: Record<string, string>): ServerResponse {
  return {
    getHeaders: () => headers,
  } as unknown as ServerResponse
}

describe('BFF compression safety net (ISS-PERF1)', () => {
  let workdir = ''

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'sso-compress-'))
  })

  afterEach(async () => {
    if (workdir) await rm(workdir, { recursive: true, force: true })
  })

  it('compresses gzip when client advertises it and asset is large enough', async () => {
    const path = join(workdir, 'index.js')
    await writeFile(path, 'x'.repeat(4096))

    const decision = await decideCompression(
      requestWithEncoding('gzip, deflate, br'),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )

    expect(decision.apply).toBe(true)
    expect(decision.headers['Content-Encoding']).toBe('gzip')
    expect(decision.headers['Vary']).toBe('Accept-Encoding')
  })

  it('skips compression when upstream already encoded', async () => {
    const path = join(workdir, 'index.js')
    await writeFile(path, 'x'.repeat(4096))

    const decision = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({ 'content-encoding': 'gzip' }),
      path,
      'text/javascript',
    )

    expect(decision.apply).toBe(false)
    expect(decision.reason).toBe('upstream-already-encoded')
  })

  it('skips compression for tiny assets', async () => {
    const path = join(workdir, 'small.js')
    await writeFile(path, 'tiny')

    const decision = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )

    expect(decision.apply).toBe(false)
    expect(decision.reason).toBe('size-too-small')
  })

  it('skips compression for image MIME types', async () => {
    const path = join(workdir, 'logo.png')
    await writeFile(path, 'x'.repeat(4096))

    const decision = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({}),
      path,
      'image/png',
    )

    expect(decision.apply).toBe(false)
    expect(decision.reason).toBe('mime-not-compressible')
  })

  it('skips compression when client does not advertise gzip', async () => {
    const path = join(workdir, 'index.js')
    await writeFile(path, 'x'.repeat(4096))

    const decision = await decideCompression(
      requestWithEncoding('identity'),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )

    expect(decision.apply).toBe(false)
    expect(decision.reason).toBe('no-gzip-accept')
  })

  it('always sets Vary: Accept-Encoding even when not compressing', async () => {
    const path = join(workdir, 'index.js')
    await writeFile(path, 'x'.repeat(4096))

    const decision = await decideCompression(
      requestWithEncoding(undefined),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )

    expect(decision.headers['Vary']).toBe('Accept-Encoding')
  })

  it('treats missing file as stat-failed (still no compression, but Vary is set)', async () => {
    const decision = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({}),
      join(workdir, 'missing.js'),
      'text/javascript',
    )

    expect(decision.apply).toBe(false)
    expect(decision.reason).toBe('stat-failed')
    expect(decision.headers['Vary']).toBe('Accept-Encoding')
  })

  it('classifies extension as compressible for the gate', () => {
    expect(isCompressibleExtension('/assets/index-abc123.js')).toBe(true)
    expect(isCompressibleExtension('/assets/style-abc123.css')).toBe(true)
    expect(isCompressibleExtension('/assets/page-abc123.html')).toBe(true)
    expect(isCompressibleExtension('/assets/data-abc123.json')).toBe(true)
    expect(isCompressibleExtension('/assets/icon-abc123.svg')).toBe(true)
    expect(isCompressibleExtension('/fonts/instrument-serif.woff2')).toBe(false)
    expect(isCompressibleExtension('/img/logo-abc123.png')).toBe(false)
  })

  it('matches case-insensitively for asset extensions', () => {
    expect(isCompressibleExtension('/assets/INDEX.JS')).toBe(true)
  })

  it('handles missing extension gracefully', () => {
    expect(isCompressibleExtension('/api/healthz')).toBe(false)
  })

  // Sanity guard: do not silently regress the negotiation contract.
  it('regression: returns the same decision for the same inputs', async () => {
    const path = join(workdir, 'index.js')
    await writeFile(path, 'x'.repeat(4096))

    const a = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )
    const b = await decideCompression(
      requestWithEncoding('gzip'),
      responseWithHeaders({}),
      path,
      'text/javascript',
    )

    expect(a.apply).toBe(b.apply)
    expect(a.reason).toBe(b.reason)
  })
})

// Suppress vi import warning for use in conditional paths.
vi.fn()
