import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from './config.js'
import { handleAdminApi, handleSession, redirectForLegacyError } from './admin-handlers.js'
import {
  handleCallback,
  handleIdentityUiRedirect,
  handleLogin,
  handleLogout,
  handleRefresh,
} from './auth-handlers.js'
import type { AppResponse } from './response.js'
import { html, methodNotAllowed, send, text } from './response.js'

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
    send(response, errorPage(500, 'Panel admin sedang bermasalah', 'Silakan muat ulang halaman atau kembali ke halaman utama.'))
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
  if (pathname === '/auth/password-reset') {
    return method === 'GET' ? handleIdentityUiRedirect(requestUrl, 'password/reset') : methodNotAllowed()
  }
  if (pathname === '/auth/register') {
    return method === 'GET' ? handleIdentityUiRedirect(requestUrl, 'register') : methodNotAllowed()
  }
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
    send(response, errorPage(404, 'Halaman tidak ditemukan', 'URL ini tidak tersedia di panel admin.'))
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

function errorPage(status: number, title: string, message: string): AppResponse {
  return html(
    status,
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Dev-SSO</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,#eef4ff,transparent 58%),#f8fafc}.card{width:min(100%,480px);border:1px solid #dbe3ef;border-radius:24px;padding:32px;text-align:center;background:rgba(255,255,255,.9);box-shadow:0 24px 70px rgba(15,23,42,.14)}.badge{display:inline-flex;margin-bottom:14px;border-radius:999px;padding:6px 12px;background:#dbeafe;color:#1d4ed8;font-weight:800;font-size:12px;letter-spacing:.06em}h1{margin:0;color:#0f172a;font-size:28px;line-height:1.15}p{margin:12px 0 24px;color:#475569;line-height:1.65}a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;padding:0 18px;text-decoration:none;font-weight:800;background:#2563eb;color:white}@media (prefers-color-scheme:dark){:root{background:#020617;color:#e2e8f0}body{background:linear-gradient(180deg,rgba(37,99,235,.18),transparent 58%),#020617}.card{background:rgba(15,23,42,.9);border-color:#334155;box-shadow:0 24px 70px rgba(0,0,0,.34)}h1{color:#f8fafc}p{color:#94a3b8}}</style></head><body><main class="card"><span class="badge">${status}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/dashboard">Buka Dashboard</a></main></body></html>`,
    { 'cache-control': 'no-store, no-cache, private, max-age=0' },
  )
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
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
