import type { ServerResponse } from 'node:http'
import type { OutgoingHttpHeaders } from 'node:http'

export interface AppResponse {
  readonly status: number
  readonly headers: OutgoingHttpHeaders
  readonly body: string | Uint8Array
}

export function json(status: number, body: unknown, headers = {}): AppResponse {
  return respond(status, JSON.stringify(body), {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
}

export function text(status: number, body: string, headers = {}): AppResponse {
  return respond(status, body, { 'content-type': 'text/plain; charset=utf-8', ...headers })
}

export function html(status: number, body: string, headers = {}): AppResponse {
  return respond(status, body, { 'content-type': 'text/html; charset=utf-8', ...headers })
}

export function redirect(location: string, status = 302): AppResponse {
  return respond(status, '', { location, 'cache-control': 'no-store' })
}

export function methodNotAllowed(): AppResponse {
  return json(405, { error: 'method_not_allowed' }, { allow: 'GET, POST' })
}

export function send(response: ServerResponse, appResponse: AppResponse): void {
  response.writeHead(appResponse.status, appResponse.headers)
  response.end(appResponse.body)
}

function respond(status: number, body: string | Uint8Array, headers: AppResponse['headers']): AppResponse {
  return { status, headers, body }
}
