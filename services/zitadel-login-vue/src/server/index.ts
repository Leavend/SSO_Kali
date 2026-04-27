import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripBasePath, withBasePath } from '../shared/routes.js'
import { getConfig } from './config.js'
import { handleApi } from './api-handlers.js'
import type { AppResponse } from './response.js'
import { json, methodNotAllowed, redirect, send, text } from './response.js'

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
    send(response, json(500, { message: 'Login UI failed.' }))
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`zitadel-login-vue listening on :${config.port}`)
})

async function route(request: IncomingMessage, requestUrl: URL): Promise<AppResponse | null> {
  if (requestUrl.pathname === '/healthz') return text(200, 'ok\n', noStore())
  if (requestUrl.pathname === '/auth/password-reset') return compatibilityRedirect(request, requestUrl, '/password/reset')
  if (requestUrl.pathname === '/auth/register') return compatibilityRedirect(request, requestUrl, '/register')
  if (isLegalPath(requestUrl.pathname)) return legalRedirect(request, requestUrl.pathname)
  const routedPath = stripBasePath(config.publicBasePath, requestUrl.pathname)
  if (!routedPath) return null
  if (routedPath === '/healthz') return text(200, 'ok\n', noStore())
  if (routedPath === '/' || routedPath === '') {
    return redirect(`${withBasePath(config.publicBasePath, '/login')}${requestUrl.search}`)
  }
  if (routedPath.startsWith('/api/')) return apiRoute(request, routedPath)
  return null
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
  if (!asset) return send(response, json(404, { message: 'Static asset not found.' }))
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
    await readFile(path)
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
