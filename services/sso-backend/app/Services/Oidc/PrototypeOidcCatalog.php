<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\OidcEndpoint;

final class PrototypeOidcCatalog
{
    public function __construct(
        private readonly SigningKeyService $keys,
    ) {}

    /**
     * @return array<int, array<string, string>>
     */
    public function summary(): array
    {
        return array_map(
            static fn (OidcEndpoint $endpoint): array => $endpoint->toArray(),
            $this->endpoints(),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function discovery(): array
    {
        return [
            'issuer' => config('sso.issuer'),
            'authorization_endpoint' => $this->url('/authorize'),
            'token_endpoint' => $this->url('/token'),
            'userinfo_endpoint' => $this->url('/userinfo'),
            'jwks_uri' => $this->url('/jwks'),
            'revocation_endpoint' => $this->url('/revocation'),
            'end_session_endpoint' => $this->url('/connect/logout'),
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'subject_types_supported' => ['public'],
            'code_challenge_methods_supported' => ['S256'],
            'scopes_supported' => config('sso.default_scopes'),
            'id_token_signing_alg_values_supported' => [config('sso.signing.alg')],
            'token_endpoint_auth_methods_supported' => ['client_secret_post', 'none'],
            'claims_supported' => ['sub', 'name', 'given_name', 'family_name', 'email', 'email_verified'],
            'backchannel_logout_supported' => true,
            'backchannel_logout_session_supported' => true,
            'session_registration_endpoint' => $this->url('/connect/register-session'),
            'resource_endpoint' => $this->url('/api/profile'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function authorize(): array
    {
        return $this->payload('Authorization Code + PKCE brokered by Laravel and ZITADEL.');
    }

    /**
     * @return array<string, mixed>
     */
    public function token(): array
    {
        return $this->payload('Authorization code and refresh grants issue locally signed tokens.');
    }

    /**
     * @return array<string, mixed>
     */
    public function userInfo(): array
    {
        return $this->payload('Claims are projected from locally signed access tokens.');
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        return $this->keys->jwks();
    }

    /**
     * @return array<string, mixed>
     */
    public function revocation(): array
    {
        return $this->payload('Refresh tokens rotate locally and can revoke upstream ZITADEL refresh tokens.');
    }

    /**
     * @return array<int, OidcEndpoint>
     */
    private function endpoints(): array
    {
        return [
            new OidcEndpoint('authorize', 'GET', '/authorize', 'Authorization Code + PKCE entrypoint'),
            new OidcEndpoint('token', 'POST', '/token', 'Authorization code and refresh token exchange'),
            new OidcEndpoint('userinfo', 'GET', '/userinfo', 'Claims projection for downstream clients'),
            new OidcEndpoint('jwks', 'GET', '/jwks', 'JSON Web Key Set for local token verification'),
            new OidcEndpoint('revocation', 'POST', '/revocation', 'Refresh and access token revocation'),
            new OidcEndpoint('register-session', 'POST', '/connect/register-session', 'Registers downstream client participation for back-channel logout'),
            new OidcEndpoint('logout', 'POST', '/connect/logout', 'Revokes a logical SSO session and fan-outs back-channel logout'),
            new OidcEndpoint('profile', 'GET', '/api/profile', 'Protected resource API for synchronized user profiles'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $description): array
    {
        return [
            'status' => 'active',
            'description' => $description,
            'engine' => config('sso.engine'),
        ];
    }

    private function url(string $path): string
    {
        return rtrim((string) config('sso.base_url'), '/').$path;
    }
}
