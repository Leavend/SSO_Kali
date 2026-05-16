<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Exceptions\InvalidOidcConfigurationException;
use Illuminate\Support\Facades\Cache;

final class OidcCatalog
{
    public function __construct(private readonly SigningKeyService $keys) {}

    /**
     * @return array<string, mixed>
     */
    public function discovery(): array
    {
        return Cache::remember(
            $this->discoveryCacheKey(),
            $this->cacheTtlSeconds(),
            fn (): array => $this->freshDiscovery(),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        return Cache::remember(
            'oidc:public-metadata:jwks',
            $this->cacheTtlSeconds(),
            fn (): array => $this->keys->jwks(),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function freshDiscovery(): array
    {
        $issuer = $this->requiredUrl('sso.issuer');
        $baseUrl = rtrim($this->requiredUrl('sso.base_url'), '/');
        $algorithm = $this->requiredString('sso.signing.alg');
        $scopes = $this->requiredList('sso.default_scopes');

        $this->jwks();

        return [
            'issuer' => $issuer,
            'authorization_endpoint' => $baseUrl.'/authorize',
            'token_endpoint' => $baseUrl.'/token',
            'userinfo_endpoint' => $baseUrl.'/userinfo',
            'revocation_endpoint' => $baseUrl.'/oauth/revoke',
            'introspection_endpoint' => $baseUrl.'/introspect',
            'introspection_endpoint_auth_methods_supported' => ['client_secret_basic', 'client_secret_post'],
            'jwks_uri' => $baseUrl.'/.well-known/jwks.json',
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'subject_types_supported' => ['public'],
            'id_token_signing_alg_values_supported' => [$algorithm],
            'scopes_supported' => $scopes,
            // FR-007: advertise every auth method the token endpoint accepts.
            // 'none' covers public PKCE clients (SPAs like sso-frontend-portal)
            // which authenticate via PKCE verifier instead of a client_secret
            // per RFC 8414 §2 + RFC 7636.
            'token_endpoint_auth_methods_supported' => ['client_secret_basic', 'client_secret_post', 'none'],
            'code_challenge_methods_supported' => ['S256'],
            'claims_supported' => ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'email', 'email_verified', 'name'],
            'end_session_endpoint' => $baseUrl.'/connect/logout',
            'backchannel_logout_supported' => true,
            'backchannel_logout_session_supported' => true,
            'frontchannel_logout_supported' => true,
            'frontchannel_logout_session_supported' => true,
        ];
    }

    public function cacheTtlSeconds(): int
    {
        return max(60, (int) config('sso.public_metadata.cache_ttl_seconds', 300));
    }

    public function staleWhileRevalidateSeconds(): int
    {
        return max(0, (int) config('sso.public_metadata.stale_while_revalidate_seconds', 60));
    }

    private function discoveryCacheKey(): string
    {
        return 'oidc:public-metadata:discovery:'.hash('xxh128', json_encode([
            'issuer' => config('sso.issuer'),
            'base_url' => config('sso.base_url'),
            'alg' => config('sso.signing.alg'),
            'scopes' => config('sso.default_scopes'),
        ], JSON_THROW_ON_ERROR));
    }

    private function requiredString(string $key): string
    {
        $value = config($key);

        if (! is_string($value) || trim($value) === '') {
            throw InvalidOidcConfigurationException::missingConfig($key);
        }

        return trim($value);
    }

    private function requiredUrl(string $key): string
    {
        $value = $this->requiredString($key);

        if (filter_var($value, FILTER_VALIDATE_URL) === false) {
            throw InvalidOidcConfigurationException::invalidConfig($key, 'must be a valid URL');
        }

        return rtrim($value, '/');
    }

    /**
     * @return list<string>
     */
    private function requiredList(string $key): array
    {
        $value = config($key);

        if (! is_array($value) || $value === []) {
            throw InvalidOidcConfigurationException::missingConfig($key);
        }

        return array_values(array_map('strval', $value));
    }
}
