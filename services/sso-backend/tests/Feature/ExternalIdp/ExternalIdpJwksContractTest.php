<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\RefreshExternalIdpJwksAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpJwksService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
});

it('fetches validates caches and resolves external idp jwks keys by kid', function (): void {
    $provider = externalIdpJwksProvider();
    Http::fake([
        $provider->jwks_uri => Http::response(externalIdpJwksDocument('kid-primary'), 200),
    ]);

    $jwks = app(ExternalIdpJwksService::class)->refresh($provider, 'kid-primary');
    $key = app(ExternalIdpJwksService::class)->key($provider, 'kid-primary');
    $provider->refresh();

    expect($jwks['keys'][0]['kid'])->toBe('kid-primary')
        ->and($key['kid'])->toBe('kid-primary')
        ->and($key['alg'])->toBe('RS256')
        ->and($provider->health_status)->toBe('healthy')
        ->and($provider->last_health_checked_at)->not->toBeNull();

    Http::fake([
        $provider->jwks_uri => Http::response([], 500),
    ]);

    expect(app(ExternalIdpJwksService::class)->document($provider, 'kid-primary')['keys'][0]['kid'])
        ->toBe('kid-primary');
});

it('rejects non-https jwks uri unknown kid alg none invalid kty and non-signing keys', function (): void {
    $provider = externalIdpJwksProvider();

    $provider->forceFill(['jwks_uri' => 'http://idp.example.test/jwks']);

    expect(fn () => app(ExternalIdpJwksService::class)->refresh($provider, 'kid-primary'))
        ->toThrow(RuntimeException::class, 'External IdP JWKS could not be refreshed.');

    $provider = externalIdpJwksProvider('keycloak-unknown-kid');
    Http::fake([$provider->jwks_uri => Http::response(externalIdpJwksDocument('kid-other'), 200)]);

    expect(fn () => app(ExternalIdpJwksService::class)->refresh($provider, 'kid-primary'))
        ->toThrow(RuntimeException::class, 'External IdP JWKS could not be refreshed.');

    foreach (externalIdpInvalidJwksDocuments() as $document) {
        $provider = externalIdpJwksProvider('keycloak-invalid-'.sha1(json_encode($document, JSON_THROW_ON_ERROR)));
        Http::fake([$provider->jwks_uri => Http::response($document, 200)]);

        expect(fn () => app(ExternalIdpJwksService::class)->refresh($provider))
            ->toThrow(RuntimeException::class, 'External IdP JWKS could not be refreshed.');
    }
});

it('uses stale jwks cache when key rotation refresh temporarily fails', function (): void {
    $provider = externalIdpJwksProvider();
    Http::fake([$provider->jwks_uri => Http::response(externalIdpJwksDocument('kid-primary'), 200)]);
    app(ExternalIdpJwksService::class)->refresh($provider, 'kid-primary');

    Cache::forget('external-idp:jwks:'.$provider->provider_key);
    Http::fake([$provider->jwks_uri => Http::response([], 503)]);

    $jwks = app(ExternalIdpJwksService::class)->refresh($provider, 'kid-primary');

    expect($jwks['keys'][0]['kid'])->toBe('kid-primary');
});

it('audits jwks refresh success and failure without leaking token material', function (): void {
    $provider = externalIdpJwksProvider();
    Http::fake([$provider->jwks_uri => Http::response(externalIdpJwksDocument('kid-primary'), 200)]);

    app(RefreshExternalIdpJwksAction::class)->execute($provider, 'kid-primary', 'req-externalIdp-jwks');

    $failedProvider = externalIdpJwksProvider('keycloak-jwks-fail', 'https://idp-fail.example.test/realms/sso');
    Http::fake([$failedProvider->jwks_uri => Http::response([], 500)]);

    expect(fn () => app(RefreshExternalIdpJwksAction::class)->execute($failedProvider, 'kid-primary', 'req-externalIdp-jwks-fail'))
        ->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.jwks_refreshed', 'external_idp.jwks_failed'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->taxonomy)->toBe('external_idp.jwks_refreshed')
        ->and($events[1]->taxonomy)->toBe('external_idp.jwks_failed')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token');
});

function externalIdpJwksProvider(
    string $providerKey = 'keycloak-primary',
    string $issuer = '',
): ExternalIdentityProvider {
    $issuer = $issuer !== '' ? $issuer : 'https://'.$providerKey.'.idp.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Primary',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'jwks_uri' => $issuer.'/jwks',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => false,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'unknown',
    ]);
}

/**
 * @return array<string, mixed>
 */
function externalIdpJwksDocument(string $kid): array
{
    return [
        'keys' => [[
            'kid' => $kid,
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'n' => 'w7Zdfake-modulus-for-contract-tests',
            'e' => 'AQAB',
        ]],
    ];
}

/**
 * @return list<array<string, mixed>>
 */
function externalIdpInvalidJwksDocuments(): array
{
    return [
        ['keys' => [[...externalIdpJwksDocument('kid-none')['keys'][0], 'alg' => 'none']]],
        ['keys' => [[...externalIdpJwksDocument('kid-hmac')['keys'][0], 'alg' => 'HS256']]],
        ['keys' => [[...externalIdpJwksDocument('kid-oct')['keys'][0], 'kty' => 'oct']]],
        ['keys' => [[...externalIdpJwksDocument('kid-enc')['keys'][0], 'use' => 'enc']]],
        ['keys' => [Arr::except(externalIdpJwksDocument('kid-missing')['keys'][0], ['kid'])]],
    ];
}
