<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

final class ExternalIdpJwksService
{
    private const CACHE_TTL_SECONDS = 900;

    private const STALE_TTL_SECONDS = 86400;

    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function document(ExternalIdentityProvider $provider, ?string $expectedKid = null): array
    {
        $cached = $this->cached($provider, $expectedKid);

        if ($cached !== null) {
            return $cached;
        }

        return $this->refresh($provider, $expectedKid);
    }

    /**
     * @return array<string, mixed>
     */
    public function refresh(ExternalIdentityProvider $provider, ?string $expectedKid = null): array
    {
        try {
            $jwks = $this->loadJwks($provider, $expectedKid);
            $this->store($provider, $jwks);

            return $jwks;
        } catch (Throwable $exception) {
            return $this->staleOrFail($provider, $expectedKid, $exception);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function key(ExternalIdentityProvider $provider, string $kid): array
    {
        $jwks = $this->document($provider, $kid);

        foreach ($jwks['keys'] as $key) {
            if (($key['kid'] ?? null) === $kid) {
                return $key;
            }
        }

        throw new RuntimeException('External IdP JWKS key id was not found.');
    }

    /**
     * @return array<string, mixed>|null
     */
    private function cached(ExternalIdentityProvider $provider, ?string $expectedKid): ?array
    {
        $cached = $this->cache->get($this->cacheKey($provider));

        return $this->validJwks($provider, $cached, $expectedKid) ? $cached : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadJwks(ExternalIdentityProvider $provider, ?string $expectedKid): array
    {
        $this->assertHttps('jwks_uri', (string) $provider->jwks_uri);

        $response = Http::acceptJson()
            ->timeout($this->timeoutSeconds())
            ->retry($this->retryAttempts(), 100, throw: false)
            ->get((string) $provider->jwks_uri)
            ->throw();

        $jwks = $response->json();

        if (! $this->validJwks($provider, $jwks, $expectedKid)) {
            throw new RuntimeException('External IdP JWKS document is invalid.');
        }

        return $jwks;
    }

    /**
     * @param  array<string, mixed>  $jwks
     */
    private function store(ExternalIdentityProvider $provider, array $jwks): void
    {
        $this->cache->put($this->cacheKey($provider), $jwks, now()->addSeconds(self::CACHE_TTL_SECONDS));
        $this->cache->put($this->staleCacheKey($provider), $jwks, now()->addSeconds(self::STALE_TTL_SECONDS));

        $provider->forceFill([
            'last_health_checked_at' => now(),
            'health_status' => 'healthy',
        ])->save();
    }

    /**
     * @return array<string, mixed>
     */
    private function staleOrFail(
        ExternalIdentityProvider $provider,
        ?string $expectedKid,
        Throwable $exception,
    ): array {
        $stale = $this->cache->get($this->staleCacheKey($provider));

        if ($this->validJwks($provider, $stale, $expectedKid)) {
            return $stale;
        }

        $provider->forceFill(['health_status' => 'unhealthy'])->save();

        throw new RuntimeException('External IdP JWKS could not be refreshed.', 0, $exception);
    }

    private function validJwks(ExternalIdentityProvider $provider, mixed $jwks, ?string $expectedKid): bool
    {
        if (! is_array($jwks) || ! is_array($jwks['keys'] ?? null) || $jwks['keys'] === []) {
            return false;
        }

        $keys = array_filter(
            $jwks['keys'],
            fn (mixed $key): bool => is_array($key) && $this->validKey($provider, $key),
        );

        return $keys !== [] && $this->containsKid($keys, $expectedKid);
    }

    /**
     * @param  array<string, mixed>  $key
     */
    private function validKey(ExternalIdentityProvider $provider, array $key): bool
    {
        return is_string($key['kid'] ?? null)
            && in_array(($key['alg'] ?? null), $provider->allowed_algorithms, true)
            && ($key['alg'] ?? null) !== 'none'
            && in_array(($key['kty'] ?? null), ['RSA', 'EC'], true)
            && (($key['use'] ?? 'sig') === 'sig');
    }

    /**
     * @param  array<int, array<string, mixed>>  $keys
     */
    private function containsKid(array $keys, ?string $expectedKid): bool
    {
        if ($expectedKid === null || $expectedKid === '') {
            return true;
        }

        foreach ($keys as $key) {
            if (($key['kid'] ?? null) === $expectedKid) {
                return true;
            }
        }

        return false;
    }

    private function assertHttps(string $field, string $url): void
    {
        if (! str_starts_with($url, 'https://')) {
            throw new RuntimeException("{$field} must use HTTPS.");
        }
    }

    private function timeoutSeconds(): int
    {
        return max(1, (int) config('sso.external_idp.jwks_timeout_seconds', 5));
    }

    private function retryAttempts(): int
    {
        return max(0, (int) config('sso.external_idp.jwks_retry_attempts', 1));
    }

    private function cacheKey(ExternalIdentityProvider $provider): string
    {
        return 'external-idp:jwks:'.$provider->provider_key;
    }

    private function staleCacheKey(ExternalIdentityProvider $provider): string
    {
        return 'external-idp:jwks:stale:'.$provider->provider_key;
    }
}
