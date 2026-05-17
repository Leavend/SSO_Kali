<?php

declare(strict_types=1);

use App\Models\ExternalIdentityProvider;
use App\Models\SsoSession;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Cookie;

beforeEach(function (): void {
    Cache::flush();
    config([
        'sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback',
        'sso.frontend_url' => 'https://sso.timeh.my.id',
        'sso.login_url' => 'https://sso.timeh.my.id/login',
    ]);
});

it('completes the public external idp browser callback and creates an sso session', function (): void {
    [$provider, $keys] = externalIdpPublicCallbackProvider();
    $redirect = externalIdpPublicCallbackState($provider);

    Http::fake([
        $provider->metadata_url => Http::response(externalIdpPublicCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'upstream-access-token-must-not-leak',
            'refresh_token' => 'upstream-refresh-token-must-not-leak',
            'id_token' => externalIdpPublicCallbackIdToken($provider, $redirect['nonce'], $keys),
            'token_type' => 'Bearer',
            'expires_in' => 300,
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpPublicCallbackJwks($keys), 200),
    ]);

    $response = $this->withHeader('X-Request-Id', 'req-external-idp-public-callback')
        ->get('/external-idp/callback?'.http_build_query([
            'state' => $redirect['state'],
            'code' => 'browser-auth-code',
        ]));

    $response->assertRedirect('https://sso.timeh.my.id/portal/profile');

    $cookie = collect($response->headers->getCookies())
        ->first(fn (Cookie $cookie): bool => $cookie->getName() === config('sso.session.cookie', '__Host-sso_session'));

    expect($cookie)->not->toBeNull()
        ->and($cookie?->isHttpOnly())->toBeTrue()
        ->and(SsoSession::query()->whereNull('revoked_at')->count())->toBe(1)
        ->and((string) $cookie?->getValue())->not->toContain('upstream-access-token-must-not-leak')
        ->and(app(ExternalIdpAuthenticationRedirectService::class)->peek($redirect['state']))->toBeNull();
});

it('fails closed for missing or replayed public external idp callback state', function (): void {
    [$provider, $keys] = externalIdpPublicCallbackProvider('public-replay');
    $redirect = externalIdpPublicCallbackState($provider);

    Http::fake([
        $provider->metadata_url => Http::response(externalIdpPublicCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'must-not-leak',
            'id_token' => externalIdpPublicCallbackIdToken($provider, $redirect['nonce'], $keys),
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpPublicCallbackJwks($keys), 200),
    ]);

    $this->get('/external-idp/callback?'.http_build_query([
        'state' => $redirect['state'],
        'code' => 'first-code',
    ]))->assertRedirect('https://sso.timeh.my.id/portal/profile');

    $this->get('/external-idp/callback?'.http_build_query([
        'state' => $redirect['state'],
        'code' => 'replay-code',
    ]))->assertRedirect('https://sso.timeh.my.id/login?error=external_idp_callback_failed');

    $this->get('/external-idp/callback?code=without-state')
        ->assertRedirect('https://sso.timeh.my.id/login?error=external_idp_invalid_callback');
});

/**
 * @return array{0: ExternalIdentityProvider, 1: array{private: string, public_jwk: array<string, mixed>}}
 */
function externalIdpPublicCallbackProvider(string $providerKey = 'public-callback'): array
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';
    $provider = ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Public Callback IdP',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret_encrypted' => null,
        'authorization_endpoint' => $issuer.'/protocol/openid-connect/auth',
        'token_endpoint' => $issuer.'/protocol/openid-connect/token',
        'userinfo_endpoint' => $issuer.'/protocol/openid-connect/userinfo',
        'jwks_uri' => $issuer.'/protocol/openid-connect/certs',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => true,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);

    return [$provider, externalIdpPublicCallbackKeys()];
}

/**
 * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
 */
function externalIdpPublicCallbackState(ExternalIdentityProvider $provider): array
{
    Http::fake([$provider->metadata_url => Http::response(externalIdpPublicCallbackDiscovery($provider), 200)]);

    return app(ExternalIdpAuthenticationRedirectService::class)->create($provider, [
        'request_id' => 'req-public-callback-state',
        'return_to' => '/portal/profile',
    ]);
}

/**
 * @return array<string, mixed>
 */
function externalIdpPublicCallbackDiscovery(ExternalIdentityProvider $provider): array
{
    return [
        'issuer' => $provider->issuer,
        'authorization_endpoint' => $provider->authorization_endpoint,
        'token_endpoint' => $provider->token_endpoint,
        'userinfo_endpoint' => $provider->userinfo_endpoint,
        'jwks_uri' => $provider->jwks_uri,
        'response_types_supported' => ['code'],
        'subject_types_supported' => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
    ];
}

/**
 * @return array{private: string, public_jwk: array<string, mixed>}
 */
function externalIdpPublicCallbackKeys(): array
{
    $privateKey = openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_RSA,
        'private_key_bits' => 2048,
    ]);
    openssl_pkey_export($privateKey, $privatePem);
    $details = openssl_pkey_get_details($privateKey);
    $rsa = $details['rsa'];

    return [
        'private' => $privatePem,
        'public_jwk' => [
            'kty' => 'RSA',
            'kid' => 'public-callback-kid',
            'use' => 'sig',
            'alg' => 'RS256',
            'n' => rtrim(strtr(base64_encode($rsa['n']), '+/', '-_'), '='),
            'e' => rtrim(strtr(base64_encode($rsa['e']), '+/', '-_'), '='),
        ],
    ];
}

/**
 * @param  array{private: string, public_jwk: array<string, mixed>}  $keys
 * @param  array<string, mixed>  $overrides
 */
function externalIdpPublicCallbackIdToken(
    ExternalIdentityProvider $provider,
    string $nonce,
    array $keys,
    array $overrides = [],
): string {
    return JWT::encode([
        'iss' => $provider->issuer,
        'sub' => 'ext_public-subject',
        'aud' => $provider->client_id,
        'exp' => time() + 300,
        'iat' => time(),
        'nonce' => $nonce,
        'email' => 'public-callback@example.com',
        'email_verified' => true,
        'name' => 'Public Callback',
        ...$overrides,
    ], $keys['private'], 'RS256', 'public-callback-kid');
}

/**
 * @param  array{private: string, public_jwk: array<string, mixed>}  $keys
 * @return array{keys: list<array<string, mixed>>}
 */
function externalIdpPublicCallbackJwks(array $keys): array
{
    return ['keys' => [$keys['public_jwk']]];
}
