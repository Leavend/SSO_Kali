import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'
const ivLength = 12
const authTagLength = 16

export function encryptSession(plaintext: string): string {
  const key = sessionSecret()
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, key, iv, { authTagLength })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, encrypted]).toString('base64url')
}

export function decryptSession(ciphertext: string): string | null {
  try {
    const key = sessionSecret()
    const raw = Buffer.from(ciphertext, 'base64url')
    if (raw.length < ivLength + authTagLength + 1) return null

    const iv = raw.subarray(0, ivLength)
    const authTag = raw.subarray(ivLength, ivLength + authTagLength)
    const encrypted = raw.subarray(ivLength + authTagLength)
    const decipher = createDecipheriv(algorithm, key, iv, { authTagLength })
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
  } catch {
    return null
  }
}

function sessionSecret(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_SECRET ?? ''

  if (raw.length >= 32) {
    return createHmac('sha256', 'sso-admin-session-key').update(raw).digest()
  }

  const fallbackSeed = [
    process.env.VITE_ADMIN_BASE_URL,
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    process.env.VITE_CLIENT_ID,
    process.env.NEXT_PUBLIC_CLIENT_ID,
    'sso-frontend-runtime-fallback',
  ].filter(Boolean).join('|')

  console.warn(
    'SESSION_ENCRYPTION_SECRET is not configured; using origin-scoped fallback. Configure a 32+ character secret for stable sessions.',
  )

  return createHmac('sha256', 'sso-admin-session-key').update(fallbackSeed).digest()
}
