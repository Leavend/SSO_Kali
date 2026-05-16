<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;

/**
 * RFC 7515 / OIDC BCL replay-protection store.
 *
 * Inbound logout tokens MUST be single-use until their `exp`. We persist a
 * compact key per (audience, jti) in the cache for a TTL bounded by the
 * remaining lifetime of the token, plus a small skew buffer so very-near
 * expiry tokens still fall under replay protection.
 */
final class LogoutTokenReplayStore
{
    private const KEY_PREFIX = 'oidc:logout-token:replay:';

    private const SKEW_SECONDS = 60;

    private const MAX_TTL_SECONDS = 600;

    public function __construct(
        private readonly ?Repository $cache = null,
    ) {}

    /**
     * Returns true if this is the first time we have observed this jti for
     * the audience. Subsequent calls within the TTL return false.
     */
    public function register(string $audience, string $jti, int $exp, int $now): bool
    {
        $audience = trim($audience);
        $jti = trim($jti);

        if ($audience === '' || $jti === '') {
            return true;
        }

        $ttl = $this->ttl($exp, $now);

        if ($ttl <= 0) {
            return true;
        }

        return $this->repository()->add($this->key($audience, $jti), '1', $ttl);
    }

    private function repository(): Repository
    {
        return $this->cache ?? Cache::store();
    }

    private function key(string $audience, string $jti): string
    {
        return self::KEY_PREFIX.hash('sha256', $audience.'|'.$jti);
    }

    private function ttl(int $exp, int $now): int
    {
        $remaining = $exp - $now;

        if ($remaining <= 0) {
            return 0;
        }

        return min(self::MAX_TTL_SECONDS, $remaining + self::SKEW_SECONDS);
    }
}
