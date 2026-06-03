import type { IncomingMessage } from 'node:http'
import { getConfig } from './config.js'
import { buildProxyRequestHeaders, buildProxyResponseHeaders } from './proxy-headers.js'
import type { AppResponse } from './response.js'

export async function proxyToSsoBackend(
  request: IncomingMessage,
  requestUrl: URL,
): Promise<AppResponse> {
  const target = `${trimTrailingSlash(getConfig().internalBaseUrl)}${requestUrl.pathname}${requestUrl.search}`
  const response = await fetch(target, {
    method: request.method,
    headers: buildProxyRequestHeaders(request.headers),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
    duplex: 'half',
    redirect: 'manual',
  } as RequestInit & { duplex: 'half' })

  return {
    status: response.status,
    headers: buildProxyResponseHeaders(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
