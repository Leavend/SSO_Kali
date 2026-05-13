/**
 * PKCE (RFC 7636) + state/nonce helper untuk OIDC Authorization Code Flow.
 *
 * - `code_verifier`: 43–128 char random URL-safe.
 * - `code_challenge`: BASE64URL(SHA256(code_verifier)).
 * - `state`, `nonce`: opaque random yang diverifikasi saat callback.
 *
 * Menggunakan Web Crypto API (tidak bergantung pustaka pihak ketiga).
 */

const VERIFIER_BYTE_LENGTH = 32 // → 43 char base64url (memenuhi minimum RFC 7636)
const STATE_BYTE_LENGTH = 16
const NONCE_BYTE_LENGTH = 16

export type PkcePair = {
  readonly code_verifier: string
  readonly code_challenge: string
  readonly code_challenge_method: 'S256'
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = generateRandomString(VERIFIER_BYTE_LENGTH)
  const challenge = await sha256Base64Url(verifier)
  return {
    code_verifier: verifier,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }
}

export function createState(): string {
  return generateRandomString(STATE_BYTE_LENGTH)
}

export function createNonce(): string {
  return generateRandomString(NONCE_BYTE_LENGTH)
}

function generateRandomString(byteLength: number): string {
  const buffer = new Uint8Array(byteLength)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

async function sha256Base64Url(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}
