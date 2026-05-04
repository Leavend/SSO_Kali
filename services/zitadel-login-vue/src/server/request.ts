import type { IncomingMessage } from 'node:http'

const MAX_JSON_BODY_BYTES = 16 * 1024

export class RequestBodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request)
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new RequestBodyError(400, 'invalid_json_body')
  }
}

export function readCookie(request: IncomingMessage, name: string): string | null {
  const cookie = request.headers.cookie
  if (!cookie) return null

  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey === name) return rawValue.join('=')
  }

  return null
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_JSON_BODY_BYTES) throw new RequestBodyError(413, 'json_body_too_large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}
