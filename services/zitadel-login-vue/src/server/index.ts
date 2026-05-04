import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LEGACY_BASE_PATH, normalizeBasePath, stripBasePath, withBasePath } from '../shared/routes.js'
import { getConfig } from './config.js'
import { handleApi } from './api-handlers.js'
import type { AppResponse } from './response.js'
import { html, json, methodNotAllowed, redirect, send, text } from './response.js'

const config = getConfig()
const clientDir = fileURLToPath(new URL('../../client/', import.meta.url))

const server = createServer(async (request, response) => {
  try {
    const requestUrl = urlFromRequest(request)
    const appResponse = await route(request, requestUrl)
    if (appResponse) return send(response, appResponse)
    await serveStatic(requestUrl, response)
  } catch (error) {
    console.error(error)
    send(response, errorPage(500, 'Layanan login sedang bermasalah', 'Silakan muat ulang halaman atau kembali ke portal admin.'))
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`zitadel-login-vue listening on :${config.port}`)
})

async function route(request: IncomingMessage, requestUrl: URL): Promise<AppResponse | null> {
  if (requestUrl.pathname === '/healthz') return text(200, 'ok\n', noStore())
  if (requestUrl.pathname === '/dashboard') return redirect(`${config.appBaseUrl}/dashboard`)
  if (requestUrl.pathname === '/auth/password-reset') return compatibilityRedirect(request, requestUrl, '/password/reset')
  if (requestUrl.pathname === '/auth/register') return compatibilityRedirect(request, requestUrl, '/register')
  if (isLegalPath(requestUrl.pathname)) return legalRedirect(request, requestUrl.pathname)
  const legacyRedirect = legacyBasePathRedirect(requestUrl)
  if (legacyRedirect) return legacyRedirect
  const routedPath = stripBasePath(config.publicBasePath, requestUrl.pathname)
  if (!routedPath) return null
  if (routedPath === '/healthz') return text(200, 'ok\n', noStore())
  if (routedPath === '/' || routedPath === '') {
    return redirect(`${withBasePath(config.publicBasePath, '/login')}${requestUrl.search}`)
  }
  if (routedPath.startsWith('/api/')) return apiRoute(request, routedPath)
  return null
}

function legacyBasePathRedirect(requestUrl: URL): AppResponse | null {
  if (normalizeBasePath(config.publicBasePath) === LEGACY_BASE_PATH) return null
  const routedPath = stripBasePath(LEGACY_BASE_PATH, requestUrl.pathname)
  if (!routedPath) return null
  const canonicalPath = routedPath === '/' || routedPath === '' ? '/login' : routedPath
  return redirect(`${withBasePath(config.publicBasePath, canonicalPath)}${requestUrl.search}`, 308)
}

function compatibilityRedirect(request: IncomingMessage, requestUrl: URL, path: string): AppResponse {
  if (request.method !== 'GET') return methodNotAllowed()
  return redirect(`${withBasePath(config.publicBasePath, path)}${requestUrl.search}`)
}

function legalRedirect(request: IncomingMessage, path: string): AppResponse {
  if (request.method !== 'GET') return methodNotAllowed()
  return redirect(`${config.appBaseUrl}${path}`)
}

function isLegalPath(pathname: string): boolean {
  return pathname === '/terms' || pathname === '/privacy' || pathname === '/docs'
}

function apiRoute(request: IncomingMessage, routedPath: string): Promise<AppResponse> | AppResponse {
  if (request.method !== 'POST') return methodNotAllowed()
  return handleApi(request, routedPath.slice('/api'.length), config)
}

async function serveStatic(requestUrl: URL, response: ServerResponse): Promise<void> {
  const asset = await resolveAsset(requestUrl.pathname)
  if (!asset) {
    send(response, errorPage(404, 'Halaman tidak ditemukan', 'URL ini tidak tersedia di layanan login.'))
    return
  }
  response.writeHead(200, staticHeaders(asset))
  createReadStream(asset.path).pipe(response)
}

async function resolveAsset(pathname: string): Promise<{ readonly path: string; readonly immutable: boolean } | null> {
  const routedPath = stripBasePath(config.publicBasePath, pathname) ?? pathname
  const normalized = normalize(decodeURIComponent(routedPath === '/' ? '/index.html' : routedPath))
  const target = join(clientDir, normalized.replace(/^(\.\.[/\\])+/, ''))
  if (isInsideClientDir(target) && (await exists(target))) return { path: target, immutable: normalized.startsWith('/assets/') }
  return extname(normalized) ? null : { path: join(clientDir, 'index.html'), immutable: false }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function staticHeaders(asset: { readonly path: string; readonly immutable: boolean }): Record<string, string> {
  return {
    'cache-control': asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'content-type': contentType(asset.path),
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  }
}

function noStore(): Record<string, string> {
  return { 'cache-control': 'no-store' }
}

function errorPage(status: number, title: string, message: string): AppResponse {
  return html(
    status,
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Dev-SSO</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,#eef4ff,transparent 58%),#f8fafc}.card{width:min(100%,480px);border:1px solid #dbe3ef;border-radius:24px;padding:32px;text-align:center;background:rgba(255,255,255,.88);box-shadow:0 24px 70px rgba(15,23,42,.14)}.badge{display:inline-flex;margin-bottom:14px;border-radius:999px;padding:6px 12px;background:#dbeafe;color:#1d4ed8;font-weight:800;font-size:12px;letter-spacing:.06em}h1{margin:0;color:#0f172a;font-size:28px;line-height:1.15}p{margin:12px 0 24px;color:#475569;line-height:1.65}.actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;padding:0 18px;text-decoration:none;font-weight:800}.primary{background:#2563eb;color:white}.secondary{border:1px solid #cbd5e1;color:#0f172a}@media (prefers-color-scheme:dark){:root{background:#020617;color:#e2e8f0}body{background:linear-gradient(180deg,rgba(37,99,235,.18),transparent 58%),#020617}.card{background:rgba(15,23,42,.88);border-color:#334155;box-shadow:0 24px 70px rgba(0,0,0,.34)}h1{color:#f8fafc}p{color:#94a3b8}.secondary{border-color:#475569;color:#e2e8f0}}</style></head><body><main class="card"><span class="badge">${status}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="actions"><a class="primary" href="${config.appBaseUrl}/dashboard">Buka Dashboard</a><a class="secondary" href="${withBasePath(config.publicBasePath, '/login')}">Kembali Login</a></div></main></body></html>`,
    noStore(),
  )
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function urlFromRequest(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
}

function isInsideClientDir(target: string): boolean {
  const rel = relative(clientDir, target)
  return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith('/')
}

function contentType(pathname: string): string {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8'
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8'
  if (pathname.endsWith('.svg')) return 'image/svg+xml'
  if (pathname.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}
