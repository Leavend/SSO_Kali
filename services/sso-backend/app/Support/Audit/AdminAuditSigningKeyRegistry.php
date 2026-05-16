<?php

declare(strict_types=1);

namespace App\Support\Audit;

use Illuminate\Support\Str;

/**
 * Resolves the active HMAC signing key (and key id) for admin audit events.
 *
 * Key lookup precedence:
 * 1. config('audit.signing_keys') keyed map [key_id => secret]
 * 2. config('audit.signing_key') — single secret with optional key id
 * 3. config('app.key') — legacy fallback (key id "legacy")
 */
final class AdminAuditSigningKeyRegistry
{
    /**
     * @return array<string, string>
     */
    public function keys(): array
    {
        $configured = config('audit.signing_keys');
        if (is_array($configured) && $configured !== []) {
            $map = [];
            foreach ($configured as $keyId => $secret) {
                $secret = is_string($secret) ? $secret : '';
                $keyId = is_string($keyId) ? $keyId : '';
                if ($keyId === '' || $secret === '') {
                    continue;
                }
                $map[$keyId] = $secret;
            }
            if ($map !== []) {
                return $map;
            }
        }

        $single = (string) config('audit.signing_key', '');
        if ($single !== '') {
            $keyId = (string) config('audit.signing_key_id', 'primary');

            return [$keyId => $single];
        }

        return ['legacy' => (string) config('app.key', 'missing-app-key')];
    }

    public function activeKeyId(): string
    {
        $configured = (string) config('audit.active_signing_key_id', '');
        $keys = $this->keys();
        if ($configured !== '' && array_key_exists($configured, $keys)) {
            return $configured;
        }

        return (string) array_key_first($keys);
    }

    public function activeKey(): string
    {
        return $this->keys()[$this->activeKeyId()];
    }

    public function keyForId(string $keyId): ?string
    {
        return $this->keys()[$keyId] ?? null;
    }

    /**
     * Stable key id when callers persist NULL signing_key_id rows from
     * pre-rotation history.
     */
    public function legacyKeyId(): string
    {
        return Str::ascii('legacy');
    }
}
