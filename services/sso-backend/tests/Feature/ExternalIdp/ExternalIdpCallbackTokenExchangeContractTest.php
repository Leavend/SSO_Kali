<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\ExchangeExternalIdpCallbackTokenAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use App\Services\ExternalIdp\ExternalIdpTokenExchangeService;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);
});

it('exchanges an external idp callback authorization code and validates id token claims', function (): void {
    [$provider, $keys] = externalIdpCallbackProvider();
    $redirect = externalIdpCreateAuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(externalIdpCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'upstream-access-token',
            'refresh_token' => 'upstream-refresh-token',
            'id_token' => externalIdpIdToken($provider, $redirect['nonce'], $keys),
            'token_type' => 'Bearer',
            'expires_in' => 300,
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpCallbackJwks($keys), 200),
    ]);

    $result = app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-123');

    expect($result['provider_key'])->toBe($provider->provider_key)
        ->and($result['subject'])->toBe('external-user-1')
        ->and($result['email'])->toBe('external@example.com')
        ->and($result['name'])->toBe('External User')
        ->and($result['return_to'])->toBe('/admin/external-idps')
        ->and($result['claims'])->toHaveKeys(['iss', 'sub', 'aud', 'nonce', 'email', 'name'])
        ->and(app(ExternalIdpAuthenticationRedirectService::class)->peek($redirect['state']))->toBeNull();

    Http::assertSent(fn ($request): bool => $request->url() === $provider->token_endpoint
        && $request['grant_type'] === 'authorization_code'
        && $request['client_id'] === 'sso-broker'
        && $request['code'] === 'auth-code-123'
        && $request['redirect_uri'] === 'https://api-sso.timeh.my.id/external-idp/callback'
        && is_string($request['code_verifier']));
});

it('rejects invalid replayed state and non-https token endpoint', function (): void {
    [$provider, $keys] = externalIdpCallbackProvider();
    $redirect = externalIdpCreateAuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(externalIdpCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response(['id_token' => externalIdpIdToken($provider, $redirect['nonce'], $keys)], 200),
        $provider->jwks_uri => Http::response(externalIdpCallbackJwks($keys), 200),
    ]);

    app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-123');

    expect(fn () => app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-123'))
        ->toThrow(RuntimeException::class, 'External IdP authentication state is invalid or expired.');

    [$badProvider] = externalIdpCallbackProvider('keycloak-http-token');
    $badProvider->forceFill(['token_endpoint' => 'http://keycloak.example.test/token'])->save();
    $badState = 'bad-http-token-state';
    Cache::put('external-idp:auth-state:'.$badState, [
        'provider_key' => $badProvider->provider_key,
        'issuer' => $badProvider->issuer,
        'state' => $badState,
        'nonce' => 'bad-http-token-nonce',
        'code_verifier' => 'bad-http-token-verifier',
        'redirect_uri' => 'https://api-sso.timeh.my.id/external-idp/callback',
    ], now()->addMinutes(5));
    Http::fake([$badProvider->metadata_url => Http::response(externalIdpCallbackDiscovery($badProvider), 200)]);

    expect(fn () => app(ExternalIdpTokenExchangeService::class)->exchange($badProvider, $badState, 'auth-code-123'))
        ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');
});

it('rejects issuer nonce algorithm and kid validation failures', function (string $failure, string $message): void {
    [$provider, $keys] = externalIdpCallbackProvider('keycloak-'.$failure);
    $redirect = externalIdpCreateAuthState($provider);
    $token = match ($failure) {
        'issuer' => externalIdpIdToken($provider, $redirect['nonce'], $keys, ['iss' => 'https://evil.example.test']),
        'nonce' => externalIdpIdToken($provider, 'wrong-nonce', $keys),
        'alg' => externalIdpIdToken($provider, $redirect['nonce'], $keys, [], 'RS512'),
        'kid' => externalIdpIdToken($provider, $redirect['nonce'], $keys, [], 'RS256', 'unknown-kid'),
        default => throw new RuntimeException('Unknown failure fixture.'),
    };

    Http::fake([
        $provider->metadata_url => Http::response(externalIdpCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response(['id_token' => $token], 200),
        $provider->jwks_uri => Http::response(externalIdpCallbackJwks($keys), 200),
    ]);

    expect(fn () => app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-123'))
        ->toThrow(RuntimeException::class, $message);
})->with([
    'issuer mismatch' => ['issuer', 'External IdP issuer claim mismatch.'],
    'nonce mismatch' => ['nonce', 'External IdP nonce claim mismatch.'],
    'algorithm mismatch' => ['alg', 'External IdP id_token algorithm is not allowed.'],
    'kid mismatch' => ['kid', 'External IdP id_token signature validation failed.'],
]);

it('audits callback token exchange success and failure without leaking upstream tokens', function (): void {
    [$provider, $keys] = externalIdpCallbackProvider();
    $redirect = externalIdpCreateAuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(externalIdpCallbackDiscovery($provider), 200),
        $provider->token_endpoint => Http::response([
            'access_token' => 'must-not-leak',
            'refresh_token' => 'must-not-leak',
            'id_token' => externalIdpIdToken($provider, $redirect['nonce'], $keys),
        ], 200),
        $provider->jwks_uri => Http::response(externalIdpCallbackJwks($keys), 200),
    ]);

    app(ExchangeExternalIdpCallbackTokenAction::class)->execute($provider, $redirect['state'], 'auth-code-123', 'req-externalIdp-callback');

    expect(fn () => app(ExchangeExternalIdpCallbackTokenAction::class)->execute($provider, 'missing-state', 'auth-code-123', 'req-externalIdp-callback-fail'))
        ->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.callback_exchange_succeeded', 'external_idp.callback_exchange_failed'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.callback.exchange')
        ->and($events[0]->context['subject'])->toBe('external-user-1')
        ->and($events[1]->taxonomy)->toBe('external_idp.callback_exchange_failed')
        ->and($encoded)->toContain('req-externalIdp-callback')
        ->and($encoded)->not->toContain('must-not-leak')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('code_verifier');
});

/**
 * @return array{0: ExternalIdentityProvider, 1: array{private: string, public_jwk: array<string, mixed>}}
 */
function externalIdpCallbackProvider(string $providerKey = 'keycloak-callback'): array
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';
    $provider = ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Callback',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-broker',
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

    return [$provider, externalIdpCallbackKeys()];
}

/**
 * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
 */
function externalIdpCreateAuthState(ExternalIdentityProvider $provider): array
{
    Http::fake([$provider->metadata_url => Http::response(externalIdpCallbackDiscovery($provider), 200)]);

    return app(ExternalIdpAuthenticationRedirectService::class)->create($provider, [
        'request_id' => 'req-externalIdp-callback-state',
        'return_to' => '/admin/external-idps',
    ]);
}

/**
 * @return array<string, mixed>
 */
function externalIdpCallbackDiscovery(ExternalIdentityProvider $provider): array
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
function externalIdpCallbackKeys(): array
{
    $privateKey = openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_RSA,
        'private_key_bits' => 2048,
    ]);
    openssl_pkey_export($privateKey, $privatePem);
    $details = openssl_pkey_get_details($privateKey);

    return [
        'private' => $privatePem,
        'public_jwk' => [
            'kid' => 'kid-callback-primary',
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'n' => rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '='),
            'e' => rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '='),
        ],
    ];
}

/**
 * @param  array{public_jwk: array<string, mixed>}  $keys
 * @return array<string, mixed>
 */
function externalIdpCallbackJwks(array $keys): array
{
    return ['keys' => [$keys['public_jwk']]];
}

/**
 * @param  array{private: string}  $keys
 * @param  array<string, mixed>  $overrides
 */
function externalIdpIdToken(
    ExternalIdentityProvider $provider,
    string $nonce,
    array $keys,
    array $overrides = [],
    string $algorithm = 'RS256',
    string $kid = 'kid-callback-primary',
): string {
    return JWT::encode([
        'iss' => $provider->issuer,
        'sub' => 'external-user-1',
        'aud' => $provider->client_id,
        'nonce' => $nonce,
        'email' => 'external@example.com',
        'email_verified' => true,
        'name' => 'External User',
        'iat' => now()->timestamp,
        'exp' => now()->addMinutes(5)->timestamp,
        ...$overrides,
    ], $keys['private'], $algorithm, $kid);
}
