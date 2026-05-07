<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Exceptions\InvalidOidcConfigurationException;

final class OidcCatalog
{
    public function __construct(private readonly SigningKeyService $keys) {}

    /**
     * @return array<string, mixed>
     */
    public function discovery(): array
    {
        $issuer = $this->requiredUrl('sso.issuer');
        $baseUrl = rtrim($this->requiredUrl('sso.base_url'), '/');
        $algorithm = $this->requiredString('sso.signing.alg');
        $scopes = $this->requiredList('sso.default_scopes');

        $this->keys->jwks();

        return [
            'issuer' => $issuer,
            'authorization_endpoint' => $baseUrl.'/oauth/authorize',
            'token_endpoint' => $baseUrl.'/oauth/token',
            'userinfo_endpoint' => $baseUrl.'/userinfo',
            'revocation_endpoint' => $baseUrl.'/oauth/revoke',
            'jwks_uri' => $baseUrl.'/.well-known/jwks.json',
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'subject_types_supported' => ['public'],
            'id_token_signing_alg_values_supported' => [$algorithm],
            'scopes_supported' => $scopes,
            'token_endpoint_auth_methods_supported' => ['client_secret_post', 'client_secret_basic'],
            'code_challenge_methods_supported' => ['S256'],
            'claims_supported' => ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'email', 'email_verified', 'name'],
            'end_session_endpoint' => $baseUrl.'/connect/logout',
            'backchannel_logout_supported' => true,
            'backchannel_logout_session_supported' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        return $this->keys->jwks();
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
