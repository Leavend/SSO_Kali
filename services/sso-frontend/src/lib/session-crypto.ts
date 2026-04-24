import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function sessionSecret(): Buffer {
  const raw = process.env.SESSION_ENCRYPTION_SECRET ?? "";

  if (raw.length < 32) {
    throw new Error(
      "SESSION_ENCRYPTION_SECRET must be at least 32 characters. "
      + "Generate one with: openssl rand -hex 32",
    );
  }

  return deriveKey(raw);
}

function deriveKey(secret: string): Buffer {
  return createHmac("sha256", "sso-admin-session-key")
    .update(secret)
    .digest();
}

export function encryptSession(plaintext: string): string {
  const key = sessionSecret();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptSession(ciphertext: string): string | null {
  try {
    const key = sessionSecret();
    const raw = Buffer.from(ciphertext, "base64url");
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  } catch {
    return null;
  }
}
