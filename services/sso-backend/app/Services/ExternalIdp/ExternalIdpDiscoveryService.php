<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

final class ExternalIdpDiscoveryService
{
    private const CACHE_TTL_SECONDS = 900;

    private const STALE_TTL_SECONDS = 86400;

    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function discovery(ExternalIdentityProvider $provider): array
    {
        $cached = $this->cached($provider);

        if ($cached !== null) {
            return $cached;
        }

        return $this->refresh($provider);
    }

    /**
     * @return array<string, mixed>
     */
    public function refresh(ExternalIdentityProvider $provider): array
    {
        try {
            $discovery = $this->loadDiscovery($provider);
            $this->store($provider, $discovery);

            return $discovery;
        } catch (Throwable $exception) {
            return $this->staleOrFail($provider, $exception);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function cached(ExternalIdentityProvider $provider): ?array
    {
        $cached = $this->cache->get($this->cacheKey($provider));

        return $this->validDiscovery($provider, $cached) ? $cached : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadDiscovery(ExternalIdentityProvider $provider): array
    {
        $this->assertHttps('metadata_url', $provider->metadata_url);

        $response = Http::acceptJson()
            ->timeout($this->timeoutSeconds())
            ->retry($this->retryAttempts(), 100, throw: false)
            ->get($provider->metadata_url)
            ->throw();

        $discovery = $response->json();

        if (! $this->validDiscovery($provider, $discovery)) {
            throw new RuntimeException('External IdP discovery document is invalid.');
        }

        return $discovery;
    }

    /**
     * @param  array<string, mixed>  $discovery
     */
    private function store(ExternalIdentityProvider $provider, array $discovery): void
    {
        $this->cache->put($this->cacheKey($provider), $discovery, now()->addSeconds(self::CACHE_TTL_SECONDS));
        $this->cache->put($this->staleCacheKey($provider), $discovery, now()->addSeconds(self::STALE_TTL_SECONDS));

        $provider->forceFill([
            'authorization_endpoint' => $discovery['authorization_endpoint'],
            'token_endpoint' => $discovery['token_endpoint'],
            'userinfo_endpoint' => $discovery['userinfo_endpoint'],
            'jwks_uri' => $discovery['jwks_uri'],
            'last_discovered_at' => now(),
            'health_status' => 'healthy',
        ])->save();
    }

    /**
     * @return array<string, mixed>
     */
    private function staleOrFail(ExternalIdentityProvider $provider, Throwable $exception): array
    {
        $stale = $this->cache->get($this->staleCacheKey($provider));

        if ($this->validDiscovery($provider, $stale)) {
            return $stale;
        }

        $provider->forceFill(['health_status' => 'unhealthy'])->save();

        throw new RuntimeException('External IdP discovery could not be refreshed.', 0, $exception);
    }

    private function assertHttps(string $field, string $url): void
    {
        if (! str_starts_with($url, 'https://')) {
            throw new RuntimeException("{$field} must use HTTPS.");
        }
    }

    private function timeoutSeconds(): int
    {
        return max(1, (int) config('sso.external_idp.discovery_timeout_seconds', 5));
    }

    private function retryAttempts(): int
    {
        return max(0, (int) config('sso.external_idp.discovery_retry_attempts', 1));
    }

    private function cacheKey(ExternalIdentityProvider $provider): string
    {
        return 'external-idp:discovery:'.$provider->provider_key;
    }

    private function staleCacheKey(ExternalIdentityProvider $provider): string
    {
        return 'external-idp:discovery:stale:'.$provider->provider_key;
    }

    private function validDiscovery(ExternalIdentityProvider $provider, mixed $discovery): bool
    {
        return is_array($discovery)
            && ($discovery['issuer'] ?? null) === $provider->issuer
            && $this->hasHttpsEndpoint($discovery, 'authorization_endpoint')
            && $this->hasHttpsEndpoint($discovery, 'token_endpoint')
            && $this->hasHttpsEndpoint($discovery, 'userinfo_endpoint')
            && $this->hasHttpsEndpoint($discovery, 'jwks_uri')
            && is_array($discovery['response_types_supported'] ?? null)
            && is_array($discovery['subject_types_supported'] ?? null)
            && is_array($discovery['id_token_signing_alg_values_supported'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $discovery
     */
    private function hasHttpsEndpoint(array $discovery, string $key): bool
    {
        return is_string($discovery[$key] ?? null)
            && str_starts_with($discovery[$key], 'https://');
    }
}
