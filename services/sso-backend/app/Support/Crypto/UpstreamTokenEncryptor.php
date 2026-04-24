<?php

declare(strict_types=1);

namespace App\Support\Crypto;

use RuntimeException;

/**
 * Dedicated encryptor for upstream refresh tokens, isolated from APP_KEY.
 *
 * This avoids the problem where rotating APP_KEY silently breaks all
 * active refresh-token chains.  The key is a 256-bit hex secret stored
 * in UPSTREAM_TOKEN_KEY and is rotated independently of the Laravel
 * application key.
 *
 * Algorithm: AES-256-GCM (authenticated encryption).
 */
final class UpstreamTokenEncryptor
{
    private const string CIPHER = 'aes-256-gcm';

    public function encrypt(string $plaintext): string
    {
        $key = $this->key();
        $iv = random_bytes(12); // 96-bit nonce for GCM
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16,
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Upstream token encryption failed.');
        }

        // Packed format: base64( iv || tag || ciphertext )
        return base64_encode($iv.$tag.$ciphertext);
    }

    public function decrypt(string $packed): string
    {
        $key = $this->key();
        $raw = base64_decode($packed, true);

        if ($raw === false || strlen($raw) < 28) { // 12 iv + 16 tag = 28 min
            throw new RuntimeException('Upstream token ciphertext is malformed.');
        }

        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ciphertext = substr($raw, 28);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
        );

        if ($plaintext === false) {
            throw new RuntimeException('Upstream token decryption failed — key mismatch or data tampering.');
        }

        return $plaintext;
    }

    /**
     * Determine if a stored value uses the legacy APP_KEY-based encryption
     * (Laravel Crypt::encryptString format starts with "eyJ" — base64-encoded JSON).
     */
    public function isLegacyFormat(?string $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        // Laravel's Crypt envelope is base64-encoded JSON: {"iv":"...","value":"...","mac":"...","tag":"..."}
        $decoded = base64_decode($value, true);

        if ($decoded === false) {
            return false;
        }

        return str_starts_with($decoded, '{"iv"') || str_starts_with($decoded, '{"value"');
    }

    /**
     * @return non-empty-string Binary 256-bit key
     */
    private function key(): string
    {
        $hex = (string) config('sso.upstream_token_key');

        if ($hex === '') {
            // Fall back to APP_KEY derivation for backward compatibility, but log warning
            $appKey = (string) config('app.key');
            $rawAppKey = str_starts_with($appKey, 'base64:')
                ? base64_decode(substr($appKey, 7), true)
                : $appKey;

            if ($rawAppKey === false || $rawAppKey === '') {
                throw new RuntimeException(
                    'UPSTREAM_TOKEN_KEY is not configured and APP_KEY cannot be derived. '
                    .'Set UPSTREAM_TOKEN_KEY in your environment.',
                );
            }

            // Derive a separate key from APP_KEY so rotating APP_KEY would still break,
            // but at least the intent is clear that UPSTREAM_TOKEN_KEY should be set.
            return hash_hmac('sha256', 'upstream-token-encryptor', $rawAppKey, true);
        }

        $key = hex2bin($hex);

        if ($key === false || strlen($key) !== 32) {
            throw new RuntimeException(
                'UPSTREAM_TOKEN_KEY must be a 64-character hex string (256 bits). '
                .'Generate one with: php -r "echo bin2hex(random_bytes(32));"',
            );
        }

        return $key;
    }
}
