<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Exceptions\OidcScopeException;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\OidcScope;
use App\Support\Oidc\ScopeSet;

final class ScopePolicy
{
    /**
     * @return list<string>
     */
    public function defaultAllowedScopes(): array
    {
        return OidcScope::defaultAllowed();
    }

    /**
     * @return list<array{name: string, description: string, claims: list<string>, default_allowed: bool}>
     */
    public function catalog(): array
    {
        $catalog = [];

        foreach (OidcScope::catalog() as $name => $definition) {
            $catalog[] = ['name' => $name, ...$definition];
        }

        return $catalog;
    }

    public function normalizeString(string $scope): string
    {
        return ScopeSet::toString($this->normalize(ScopeSet::fromString($scope)));
    }

    /**
     * @param  list<string>  $scopes
     * @return list<string>
     */
    public function normalize(array $scopes): array
    {
        return array_values(array_unique(array_filter(
            $scopes,
            static fn (string $scope): bool => $scope !== '',
        )));
    }

    public function validateAuthorizationRequest(string $scope, DownstreamClient $client): string
    {
        $requested = $this->normalize(ScopeSet::fromString($scope));
        $this->assertOpenid($requested);
        $this->assertKnown($requested);
        $this->assertAllowed($requested, $client->allowedScopes);

        return ScopeSet::toString($requested);
    }

    /**
     * @param  list<string>  $scopes
     * @return list<string>
     */
    public function normalizeAllowedScopes(array $scopes): array
    {
        $normalized = $this->normalize($scopes);
        $this->assertOpenid($normalized);
        $this->assertKnown($normalized);

        return $normalized;
    }

    /**
     * @param  list<string>  $scopes
     */
    private function assertOpenid(array $scopes): void
    {
        if (! ScopeSet::contains($scopes, OidcScope::OPENID)) {
            throw new OidcScopeException('openid scope is required.');
        }
    }

    /**
     * @param  list<string>  $scopes
     */
    private function assertKnown(array $scopes): void
    {
        $unknown = array_values(array_diff($scopes, OidcScope::names()));

        if ($unknown !== []) {
            throw new OidcScopeException(
                reason: 'Unknown OIDC scope requested: '.implode(', ', $unknown),
                offendingScopes: $unknown,
            );
        }
    }

    /**
     * @param  list<string>  $requested
     * @param  list<string>  $allowed
     */
    private function assertAllowed(array $requested, array $allowed): void
    {
        $notAllowed = array_values(array_diff($requested, $allowed));

        if ($notAllowed !== []) {
            throw new OidcScopeException(
                reason: 'OIDC scope is not allowed for this client: '.implode(', ', $notAllowed),
                offendingScopes: $notAllowed,
            );
        }
    }
}
