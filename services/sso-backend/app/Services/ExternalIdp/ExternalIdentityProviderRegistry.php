<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use Illuminate\Support\Facades\Crypt;
use InvalidArgumentException;

final class ExternalIdentityProviderRegistry
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $attributes): ExternalIdentityProvider
    {
        $this->assertHttps('issuer', (string) $attributes['issuer']);
        $this->assertHttps('metadata_url', (string) $attributes['metadata_url']);

        return ExternalIdentityProvider::query()->create($this->payload($attributes));
    }

    /**
     * Determines whether a provider can currently begin a federated
     * authentication. Mirrors the gate enforced by
     * {@see ExternalIdpAuthenticationRedirectService::assertProviderUsable()}
     * but without raising — useful for routing fallbacks.
     */
    public function isUsable(ExternalIdentityProvider $provider): bool
    {
        if (! $provider->enabled) {
            return false;
        }

        return $provider->health_status !== 'unhealthy';
    }

    /**
     * @return array<string, mixed>
     */
    public function publicView(ExternalIdentityProvider $provider): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'display_name' => $provider->display_name,
            'issuer' => $provider->issuer,
            'metadata_url' => $provider->metadata_url,
            'client_id' => $provider->client_id,
            'authorization_endpoint' => $provider->authorization_endpoint,
            'token_endpoint' => $provider->token_endpoint,
            'userinfo_endpoint' => $provider->userinfo_endpoint,
            'jwks_uri' => $provider->jwks_uri,
            'allowed_algorithms' => $provider->allowed_algorithms,
            'scopes' => $provider->scopes,
            'priority' => $provider->priority,
            'enabled' => $provider->enabled,
            'is_backup' => $provider->is_backup,
            'tls_validation_enabled' => $provider->tls_validation_enabled,
            'signature_validation_enabled' => $provider->signature_validation_enabled,
            'has_client_secret' => $provider->client_secret_encrypted !== null,
            'health_status' => $provider->health_status,
        ];
    }

    private function assertHttps(string $field, string $url): void
    {
        if (! str_starts_with($url, 'https://')) {
            throw new InvalidArgumentException("{$field} must use HTTPS.");
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function payload(array $attributes): array
    {
        return [
            ...$this->defaults(),
            ...$attributes,
            'client_secret_encrypted' => $this->encryptedSecret($attributes['client_secret'] ?? null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function defaults(): array
    {
        return [
            'allowed_algorithms' => ['RS256'],
            'scopes' => ['openid', 'profile', 'email'],
            'enabled' => false,
            'is_backup' => false,
            'priority' => 100,
            'tls_validation_enabled' => true,
            'signature_validation_enabled' => true,
            'health_status' => 'unknown',
        ];
    }

    private function encryptedSecret(mixed $secret): ?string
    {
        if (! is_string($secret) || $secret === '') {
            return null;
        }

        return Crypt::encryptString($secret);
    }
}
