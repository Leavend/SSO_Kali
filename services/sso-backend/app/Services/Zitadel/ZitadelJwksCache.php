<?php

declare(strict_types=1);

namespace App\Services\Zitadel;

use App\Services\Oidc\JwksRotationMetrics;
use App\Support\Cache\ResilientCacheStore;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

final class ZitadelJwksCache
{
    public function __construct(
        private readonly JwksRotationMetrics $metrics,
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function document(string $url, ?string $expectedKid): array
    {
        $cached = $this->cached($url);

        if ($this->containsKid($cached, $expectedKid)) {
            $this->metrics->recordCacheHit();

            return $cached;
        }

        $this->metrics->recordCacheMiss();

        return $this->refresh($url, $expectedKid);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function cached(string $url): ?array
    {
        $cached = $this->cache->get($this->cacheKey($url));

        return $this->validJwks($cached) ? $cached : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function refresh(string $url, ?string $expectedKid): array
    {
        $last = null;

        for ($attempt = 1; $attempt <= $this->maxRefreshAttempts(); $attempt++) {
            try {
                $jwks = $this->loadJwks($url);
            } catch (Throwable $exception) {
                $last = $exception;

                continue;
            }

            if ($this->containsKid($jwks, $expectedKid)) {
                $this->metrics->recordRefreshSuccess();

                return $jwks;
            }
        }

        $this->metrics->recordRefreshFailure();

        throw new RuntimeException('The upstream JWKS could not be refreshed for the requested key.', 0, $last);
    }

    /**
     * @return array<string, mixed>
     */
    private function loadJwks(string $url): array
    {
        $response = Http::acceptJson()
            ->timeout(5)
            ->withHeaders($this->internalHostHeader())
            ->get($url);
        $jwks = $response->throw()->json();

        if (! $this->validJwks($jwks)) {
            throw new RuntimeException('The upstream JWKS document is invalid.');
        }

        $this->cache->put($this->cacheKey($url), $jwks, now()->addSeconds($this->cacheTtlSeconds($response)));

        return $jwks;
    }

    /**
     * When fetching JWKS from the Docker-internal ZITADEL URL, pass the public
     * issuer's host so ZITADEL can resolve the correct instance.
     *
     * @return array<string, string>
     */
    private function internalHostHeader(): array
    {
        $publicIssuer = (string) config('sso.broker.public_issuer');
        $host = parse_url($publicIssuer, PHP_URL_HOST);

        return is_string($host) && $host !== '' ? ['Host' => $host] : [];
    }

    private function cacheTtlSeconds(Response $response): int
    {
        $ttl = $this->cacheControlMaxAge($response) ?? $this->expiresHeaderTtl($response) ?? $this->defaultCacheTtlSeconds();

        return $this->boundedTtlSeconds($ttl);
    }

    private function cacheControlMaxAge(Response $response): ?int
    {
        $header = (string) $response->header('Cache-Control');
        $matches = [];

        if (preg_match('/max-age=(\d+)/i', $header, $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }

    private function expiresHeaderTtl(Response $response): ?int
    {
        $header = $response->header('Expires');

        if (trim($header) === '') {
            return null;
        }

        $expiresAt = CarbonImmutable::parse($header);

        return max(0, $expiresAt->getTimestamp() - time());
    }

    private function boundedTtlSeconds(int $ttl): int
    {
        return min($this->maxCacheTtlSeconds(), max($this->minCacheTtlSeconds(), $ttl));
    }

    private function containsKid(?array $jwks, ?string $expectedKid): bool
    {
        if ($jwks === null) {
            return false;
        }

        if ($expectedKid === null || $expectedKid === '') {
            return true;
        }

        foreach ($jwks['keys'] as $key) {
            if (($key['kid'] ?? null) === $expectedKid) {
                return true;
            }
        }

        return false;
    }

    private function validJwks(mixed $jwks): bool
    {
        return is_array($jwks)
            && is_array($jwks['keys'] ?? null)
            && $jwks['keys'] !== [];
    }

    private function cacheKey(string $url): string
    {
        return 'zitadel:jwks:'.sha1($url);
    }

    private function defaultCacheTtlSeconds(): int
    {
        return (int) config('sso.jwks.cache_ttl_seconds', 300);
    }

    private function minCacheTtlSeconds(): int
    {
        return max(0, (int) config('sso.jwks.min_cache_ttl_seconds', 30));
    }

    private function maxCacheTtlSeconds(): int
    {
        return max($this->minCacheTtlSeconds(), (int) config('sso.jwks.max_cache_ttl_seconds', 3600));
    }

    private function maxRefreshAttempts(): int
    {
        return max(1, (int) config('sso.jwks.max_refresh_attempts', 2));
    }
}
