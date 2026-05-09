<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Support\Cache\ResilientCacheStore;
use App\Support\Oidc\Pkce;
use Illuminate\Support\Str;
use RuntimeException;

final class ExternalIdpAuthenticationRedirectService
{
    public function __construct(
        private readonly ExternalIdpDiscoveryService $discovery,
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
     */
    public function create(ExternalIdentityProvider $provider, array $context = []): array
    {
        $this->assertProviderUsable($provider);

        $metadata = $this->discovery->discovery($provider);
        $authorizationEndpoint = $this->authorizationEndpoint($metadata);
        $state = bin2hex(random_bytes(24));
        $nonce = bin2hex(random_bytes(24));
        $verifier = Pkce::generateVerifier();
        $challenge = Pkce::challengeFrom($verifier);

        $this->storeContext($provider, $state, $nonce, $verifier, $context);

        return [
            'redirect_url' => $authorizationEndpoint.'?'.http_build_query(
                $this->authorizationParameters($provider, $state, $nonce, $challenge, $context),
                '',
                '&',
                PHP_QUERY_RFC3986,
            ),
            'state' => $state,
            'nonce' => $nonce,
            'provider_key' => $provider->provider_key,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function peek(string $state): ?array
    {
        $context = $this->cache->get($this->cacheKey($state));

        return is_array($context) ? $context : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function pull(string $state): ?array
    {
        $context = $this->cache->pull($this->cacheKey($state));

        return is_array($context) ? $context : null;
    }

    private function assertProviderUsable(ExternalIdentityProvider $provider): void
    {
        if (! $provider->enabled) {
            throw new RuntimeException('External IdP is disabled.');
        }

        if ($provider->health_status === 'unhealthy') {
            throw new RuntimeException('External IdP is unhealthy.');
        }
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function authorizationEndpoint(array $metadata): string
    {
        $endpoint = $metadata['authorization_endpoint'] ?? null;

        if (! is_string($endpoint) || ! str_starts_with($endpoint, 'https://')) {
            throw new RuntimeException('External IdP authorization endpoint must use HTTPS.');
        }

        return $endpoint;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    private function authorizationParameters(
        ExternalIdentityProvider $provider,
        string $state,
        string $nonce,
        string $challenge,
        array $context,
    ): array {
        return array_filter([
            'client_id' => $provider->client_id,
            'redirect_uri' => $this->callbackUrl(),
            'response_type' => 'code',
            'scope' => $this->scope($provider),
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
            'prompt' => $this->optionalString($context, 'prompt'),
            'login_hint' => $this->optionalString($context, 'login_hint'),
        ], static fn (?string $value): bool => $value !== null && $value !== '');
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function storeContext(
        ExternalIdentityProvider $provider,
        string $state,
        string $nonce,
        string $verifier,
        array $context,
    ): void {
        $stored = $this->cache->put($this->cacheKey($state), [
            'provider_key' => $provider->provider_key,
            'issuer' => $provider->issuer,
            'state' => $state,
            'nonce' => $nonce,
            'code_verifier' => $verifier,
            'redirect_uri' => $this->callbackUrl(),
            'requested_at' => now()->toISOString(),
            'request_id' => $this->optionalString($context, 'request_id'),
            'return_to' => $this->safeReturnTo($context),
        ], now()->addSeconds($this->ttlSeconds()));

        if (! $stored) {
            throw new RuntimeException('External IdP authentication state could not be stored.');
        }
    }

    private function callbackUrl(): string
    {
        $url = (string) config('sso.external_idp.callback_url', rtrim((string) config('sso.base_url'), '/').'/external-idp/callback');

        if (! str_starts_with($url, 'https://')) {
            throw new RuntimeException('External IdP callback URL must use HTTPS.');
        }

        return $url;
    }

    private function scope(ExternalIdentityProvider $provider): string
    {
        $scopes = is_array($provider->scopes) && $provider->scopes !== []
            ? $provider->scopes
            : ['openid', 'profile', 'email'];

        return implode(' ', array_values(array_filter($scopes, 'is_string')));
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function optionalString(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function safeReturnTo(array $context): ?string
    {
        $returnTo = $this->optionalString($context, 'return_to');

        if ($returnTo === null || ! Str::startsWith($returnTo, '/')) {
            return null;
        }

        return Str::startsWith($returnTo, '//') ? null : $returnTo;
    }

    private function ttlSeconds(): int
    {
        return max(60, min(900, (int) config('sso.external_idp.auth_state_ttl_seconds', 300)));
    }

    private function cacheKey(string $state): string
    {
        return 'external-idp:auth-state:'.$state;
    }
}
