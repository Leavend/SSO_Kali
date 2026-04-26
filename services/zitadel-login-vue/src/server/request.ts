import type { IncomingMessage } from 'node:http'

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request)
  if (!body) return {}
  return JSON.parse(body)
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
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
