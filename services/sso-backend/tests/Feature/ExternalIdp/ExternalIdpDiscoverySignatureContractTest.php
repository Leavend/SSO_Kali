<?php

declare(strict_types=1);

use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use App\Services\ExternalIdp\ExternalIdpDiscoveryService;
use App\Services\ExternalIdp\ExternalIdpTokenExchangeService;
use Firebase\JWT\JWT;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);
});

it('enforces https issuer aligned discovery endpoints and required metadata fields', function (): void {
    $provider = issue70Provider('discovery-contract');

    foreach (issue70InvalidDiscoveryDocuments($provider) as $document) {
        Http::fake([$provider->metadata_url => Http::response($document, 200)]);

        expect(fn () => app(ExternalIdpDiscoveryService::class)->refresh($provider))
            ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');
    }
});

it('persists trusted discovery metadata only after issuer and endpoint validation succeeds', function (): void {
    $provider = issue70Provider('trusted-discovery');
    Http::fake([$provider->metadata_url => Http::response(issue70Discovery($provider), 200)]);

    $metadata = app(ExternalIdpDiscoveryService::class)->refresh($provider);
    $provider->refresh();

    expect($metadata['issuer'])->toBe($provider->issuer)
        ->and($provider->authorization_endpoint)->toBe($provider->issuer.'/protocol/openid-connect/auth')
        ->and($provider->token_endpoint)->toBe($provider->issuer.'/protocol/openid-connect/token')
        ->and($provider->userinfo_endpoint)->toBe($provider->issuer.'/protocol/openid-connect/userinfo')
        ->and($provider->jwks_uri)->toBe($provider->issuer.'/protocol/openid-connect/certs')
        ->and($provider->health_status)->toBe('healthy')
        ->and($provider->last_discovered_at)->not->toBeNull();
});

it('accepts only allowed rs256 signed id tokens with matching issuer audience nonce and subject', function (): void {
    [$provider, $keys] = issue70ProviderWithKeys('signature-valid');
    $redirect = issue70AuthState($provider);
    Http::fake([
        $provider->metadata_url => Http::response(issue70Discovery($provider), 200),
        $provider->token_endpoint => Http::response(['id_token' => issue70IdToken($provider, $redirect['nonce'], $keys)], 200),
        $provider->jwks_uri => Http::response(issue70Jwks($keys), 200),
    ]);

    $exchange = app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-valid');

    expect($exchange['subject'])->toBe('issue70-subject')
        ->and($exchange['claims'])->toHaveKeys(['iss', 'sub', 'aud', 'nonce', 'email_verified']);
});

it('rejects unsigned disallowed algorithm unknown kid and claim mismatch signatures', function (string $case, string $message): void {
    [$provider, $keys] = issue70ProviderWithKeys('signature-'.$case);
    $redirect = issue70AuthState($provider);
    $token = match ($case) {
        'alg-none' => issue70UnsignedToken($provider, $redirect['nonce']),
        'alg-rs512' => issue70IdToken($provider, $redirect['nonce'], $keys, [], 'RS512'),
        'kid-unknown' => issue70IdToken($provider, $redirect['nonce'], $keys, [], 'RS256', 'unknown-kid'),
        'issuer' => issue70IdToken($provider, $redirect['nonce'], $keys, ['iss' => 'https://evil.example.test']),
        'audience' => issue70IdToken($provider, $redirect['nonce'], $keys, ['aud' => 'evil-client']),
        'nonce' => issue70IdToken($provider, 'wrong-nonce', $keys),
        'subject' => issue70IdToken($provider, $redirect['nonce'], $keys, ['sub' => '']),
        default => throw new RuntimeException('Unknown Issue 70 signature case.'),
    };

    Http::fake([
        $provider->metadata_url => Http::response(issue70Discovery($provider), 200),
        $provider->token_endpoint => Http::response(['id_token' => $token], 200),
        $provider->jwks_uri => Http::response(issue70Jwks($keys), 200),
    ]);

    expect(fn () => app(ExternalIdpTokenExchangeService::class)->exchange($provider, $redirect['state'], 'auth-code-invalid'))
        ->toThrow(RuntimeException::class, $message);
})->with([
    'alg none' => ['alg-none', 'External IdP id_token algorithm is not allowed.'],
    'alg rs512' => ['alg-rs512', 'External IdP id_token algorithm is not allowed.'],
    'unknown kid' => ['kid-unknown', 'External IdP id_token signature validation failed.'],
    'issuer mismatch' => ['issuer', 'External IdP issuer claim mismatch.'],
    'audience mismatch' => ['audience', 'External IdP audience claim mismatch.'],
    'nonce mismatch' => ['nonce', 'External IdP nonce claim mismatch.'],
    'missing subject' => ['subject', 'External IdP subject claim is missing.'],
]);

function issue70Provider(string $providerKey): ExternalIdentityProvider
{
    $issuer = 'https://'.$providerKey.'.idp.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => str($providerKey)->replace('-', ' ')->title()->toString(),
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
        'health_status' => 'unknown',
    ]);
}

/**
 * @return array{0: ExternalIdentityProvider, 1: array{private: string, public_jwk: array<string, mixed>}}
 */
function issue70ProviderWithKeys(string $providerKey): array
{
    return [issue70Provider($providerKey), issue70Keys()];
}

/**
 * @return array<string, mixed>
 */
function issue70Discovery(ExternalIdentityProvider $provider): array
{
    return [
        'issuer' => $provider->issuer,
        'authorization_endpoint' => $provider->issuer.'/protocol/openid-connect/auth',
        'token_endpoint' => $provider->issuer.'/protocol/openid-connect/token',
        'userinfo_endpoint' => $provider->issuer.'/protocol/openid-connect/userinfo',
        'jwks_uri' => $provider->issuer.'/protocol/openid-connect/certs',
        'response_types_supported' => ['code'],
        'subject_types_supported' => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
    ];
}

/**
 * @return list<array<string, mixed>>
 */
function issue70InvalidDiscoveryDocuments(ExternalIdentityProvider $provider): array
{
    $valid = issue70Discovery($provider);

    return [
        ['issuer' => 'http://insecure-idp.example.test'],
        [...$valid, 'issuer' => 'https://evil-idp.example.test'],
        [...$valid, 'authorization_endpoint' => 'http://insecure.example.test/auth'],
        [...$valid, 'token_endpoint' => 'http://insecure.example.test/token'],
        [...$valid, 'userinfo_endpoint' => 'http://insecure.example.test/userinfo'],
        [...$valid, 'jwks_uri' => 'http://insecure.example.test/jwks'],
        Arr::except($valid, ['authorization_endpoint']),
        Arr::except($valid, ['token_endpoint']),
        Arr::except($valid, ['jwks_uri']),
    ];
}

/**
 * @return array{redirect_url: string, state: string, nonce: string, provider_key: string}
 */
function issue70AuthState(ExternalIdentityProvider $provider): array
{
    Http::fake([$provider->metadata_url => Http::response(issue70Discovery($provider), 200)]);

    return app(ExternalIdpAuthenticationRedirectService::class)->create($provider, [
        'request_id' => 'issue70-auth-state',
        'return_to' => '/admin/external-idps',
    ]);
}

/**
 * @return array{private: string, public_jwk: array<string, mixed>}
 */
function issue70Keys(): array
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
            'kid' => 'kid-issue70-primary',
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
function issue70Jwks(array $keys): array
{
    return ['keys' => [$keys['public_jwk']]];
}

/**
 * @param  array{private: string}  $keys
 * @param  array<string, mixed>  $overrides
 */
function issue70IdToken(
    ExternalIdentityProvider $provider,
    string $nonce,
    array $keys,
    array $overrides = [],
    string $algorithm = 'RS256',
    string $kid = 'kid-issue70-primary',
): string {
    return JWT::encode([
        'iss' => $provider->issuer,
        'sub' => 'issue70-subject',
        'aud' => $provider->client_id,
        'nonce' => $nonce,
        'email' => 'issue70@example.test',
        'email_verified' => true,
        'name' => 'Issue 70 User',
        'iat' => now()->timestamp,
        'exp' => now()->addMinutes(5)->timestamp,
        ...$overrides,
    ], $keys['private'], $algorithm, $kid);
}

function issue70UnsignedToken(ExternalIdentityProvider $provider, string $nonce): string
{
    $header = rtrim(strtr(base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'none'], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    $payload = rtrim(strtr(base64_encode(json_encode([
        'iss' => $provider->issuer,
        'sub' => 'issue70-subject',
        'aud' => $provider->client_id,
        'nonce' => $nonce,
        'iat' => now()->timestamp,
        'exp' => now()->addMinutes(5)->timestamp,
    ], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');

    return $header.'.'.$payload.'.';
}
