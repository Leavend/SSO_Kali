<?php

declare(strict_types=1);

namespace App\Services\Oidc\Upstream;

use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Http;

final class UpstreamOidcMetadataService
{
    private const DISCOVERY_CACHE_TTL_SECONDS = 600;

    public function __construct(
        private readonly UpstreamOidcEndpointContract $contract,
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function publicDiscovery(): array
    {
        return $this->discovery('public', $this->publicIssuer());
    }

    /**
     * @return array<string, mixed>
     */
    public function internalDiscovery(): array
    {
        return $this->discovery('internal', $this->internalIssuer());
    }

    public function publicEndpoint(string $name): string
    {
        return $this->resolvedEndpoint($this->publicDiscovery(), $this->publicIssuer(), $name);
    }

    public function internalEndpoint(string $name): string
    {
        return $this->resolvedEndpoint($this->internalDiscovery(), $this->internalIssuer(), $name);
    }

    /**
     * @return list<string>
     */
    public function validIssuers(): array
    {
        return $this->uniqueIssuers([
            $this->publicIssuer(),
            $this->issuerFrom($this->publicDiscovery()),
            $this->internalIssuer(),
            $this->issuerFrom($this->internalDiscovery()),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function discovery(string $scope, string $issuer): array
    {
        return $this->cache->remember(
            $this->discoveryCacheKey($scope, $issuer),
            now()->addSeconds(self::DISCOVERY_CACHE_TTL_SECONDS),
            fn (): array => $this->loadDiscovery($issuer),
        );
    }

    /**
     * @param  array<string, mixed>  $discovery
     */
    private function resolvedEndpoint(array $discovery, string $issuer, string $name): string
    {
        if ($this->contract->supports($name)) {
            return $this->contract->url($issuer, $name);
        }

        $fallback = $this->fallback($issuer);

        return (string) ($discovery[$name] ?? $fallback[$name]);
    }

    /**
     * @return array<string, mixed>
     */
    private function loadDiscovery(string $issuer): array
    {
        try {
            $response = Http::acceptJson()
                ->timeout(5)
                ->withHeaders($this->hostHeaderFor($issuer))
                ->get(rtrim($issuer, '/').'/.well-known/openid-configuration');

            if ($response->successful()) {
                return (array) $response->json();
            }
        } catch (\Throwable) {
            // Fall back to deterministic upstream OIDC endpoints when discovery is temporarily unreachable.
        }

        return $this->fallback($issuer);
    }

    /**
     * When calling the upstream provider through an internal URL, pass the public issuer's
     * host when the provider requires host-based tenant routing.
     *
     * @return array<string, string>
     */
    private function hostHeaderFor(string $issuer): array
    {
        $internalIssuer = $this->normalizeIssuer($this->internalIssuer());

        if ($this->normalizeIssuer($issuer) !== $internalIssuer) {
            return [];
        }

        $publicHost = parse_url($this->publicIssuer(), PHP_URL_HOST);

        return is_string($publicHost) && $publicHost !== '' ? ['Host' => $publicHost] : [];
    }

    /**
     * @return array<string, string>
     */
    private function fallback(string $issuer): array
    {
        $issuer = $this->normalizeIssuer($issuer);

        return [
            'issuer' => $issuer,
            ...collect($this->contract->supportedPaths())
                ->mapWithKeys(fn (string $path, string $endpoint): array => [$endpoint => $issuer.$path])
                ->all(),
        ];
    }

    /**
     * @return list<string>
     */
    private function uniqueIssuers(array $issuers): array
    {
        $filtered = array_filter($issuers, static fn (?string $issuer): bool => is_string($issuer) && $issuer !== '');

        return array_values(array_unique(array_map($this->normalizeIssuer(...), $filtered)));
    }

    /**
     * @param  array<string, mixed>  $discovery
     */
    private function issuerFrom(array $discovery): ?string
    {
        $issuer = $discovery['issuer'] ?? null;

        return is_string($issuer) && $issuer !== '' ? $this->normalizeIssuer($issuer) : null;
    }

    private function discoveryCacheKey(string $scope, string $issuer): string
    {
        return 'upstream_oidc:'.$scope.'-discovery:'.sha1($issuer);
    }

    private function normalizeIssuer(string $issuer): string
    {
        return rtrim($issuer, '/');
    }

    private function publicIssuer(): string
    {
        return (string) config('sso.upstream_oidc.public_issuer');
    }

    private function internalIssuer(): string
    {
        return (string) config('sso.upstream_oidc.internal_issuer');
    }
}
