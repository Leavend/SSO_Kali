import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from './config.js'
import { handleAdminApi, handleSession, redirectForLegacyError } from './admin-handlers.js'
import { handleCallback, handleLogin, handleLogout, handleRefresh } from './auth-handlers.js'
import type { AppResponse } from './response.js'
import { json, methodNotAllowed, send, text } from './response.js'

const clientDir = fileURLToPath(new URL('../../client/', import.meta.url))

const server = createServer(async (request, response) => {
  try {
    const requestUrl = urlFromRequest(request)
    const appResponse = await route(request, requestUrl)

    if (appResponse) {
      send(response, appResponse)
      return
    }

    await serveStatic(requestUrl, response)
  } catch (error) {
    console.error(error)
    send(response, json(500, { error: 'server_error', message: 'Frontend server failed.' }))
  }
})

server.listen(getConfig().port, '0.0.0.0', () => {
  console.log(`sso-frontend Vue BFF listening on :${getConfig().port}`)
})

async function route(request: IncomingMessage, requestUrl: URL): Promise<AppResponse | null> {
  const method = request.method ?? 'GET'
  const pathname = requestUrl.pathname

  if (pathname === '/healthz') return text(200, 'ok\n', { 'cache-control': 'no-store' })

  if (pathname === '/auth/login') return method === 'GET' ? handleLogin(requestUrl) : methodNotAllowed()
  if (pathname === '/auth/callback') {
    return method === 'GET' ? handleCallback(request, requestUrl) : methodNotAllowed()
  }
  if (pathname === '/auth/logout') return method === 'GET' ? handleLogout(request) : methodNotAllowed()
  if (pathname === '/auth/refresh') return method === 'POST' ? handleRefresh(request) : methodNotAllowed()

  if (pathname === '/api/session') return method === 'GET' ? handleSession(request) : methodNotAllowed()
  if (pathname.startsWith('/api/admin/')) return handleAdminApi({ request, requestUrl })

  return redirectForLegacyError(requestUrl)
}

async function serveStatic(requestUrl: URL, response: import('node:http').ServerResponse): Promise<void> {
  const asset = await resolveAsset(requestUrl.pathname)

  if (!asset) {
    send(response, json(404, { error: 'not_found', message: 'Static asset not found.' }))
    return
  }

  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'same-origin')
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('content-type', contentType(asset.path))
  response.setHeader('cache-control', asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  response.statusCode = 200

  createReadStream(asset.path).pipe(response)
}

async function resolveAsset(
  pathname: string,
): Promise<{ readonly path: string; readonly immutable: boolean } | null> {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const normalized = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '')
  const target = join(clientDir, normalized)

  if (isInsideClientDir(target)) {
    try {
      await readFile(target)
      return { path: target, immutable: normalized.startsWith('/assets/') }
    } catch {
      if (extname(normalized)) {
        return null
      }
    }
  }

  return { path: join(clientDir, 'index.html'), immutable: false }
}

function urlFromRequest(request: IncomingMessage): URL {
  const host = request.headers.host ?? '127.0.0.1'
  return new URL(request.url ?? '/', `http://${host}`)
}

function isInsideClientDir(target: string): boolean {
  const rel = relative(clientDir, target)
  return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith('/')
}

function contentType(pathname: string): string {
  switch (extname(pathname)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}
