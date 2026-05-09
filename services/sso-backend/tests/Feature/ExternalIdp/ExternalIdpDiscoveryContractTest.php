<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\RefreshExternalIdpDiscoveryAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpDiscoveryService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
});

it('fetches validates caches and persists external idp discovery metadata', function (): void {
    $provider = fr005DiscoveryProvider();
    Http::fake([
        $provider->metadata_url => Http::response(fr005DiscoveryDocument($provider), 200),
    ]);

    $metadata = app(ExternalIdpDiscoveryService::class)->refresh($provider);
    $provider->refresh();

    expect($metadata['issuer'])->toBe($provider->issuer)
        ->and($provider->authorization_endpoint)->toBe($provider->issuer.'/authorize')
        ->and($provider->token_endpoint)->toBe($provider->issuer.'/token')
        ->and($provider->userinfo_endpoint)->toBe($provider->issuer.'/userinfo')
        ->and($provider->jwks_uri)->toBe($provider->issuer.'/jwks')
        ->and($provider->health_status)->toBe('healthy')
        ->and($provider->last_discovered_at)->not->toBeNull();

    Http::fake([
        $provider->metadata_url => Http::response([], 500),
    ]);

    expect(app(ExternalIdpDiscoveryService::class)->discovery($provider)['issuer'])->toBe($provider->issuer);
});

it('rejects issuer mismatch missing required fields and non-https metadata url', function (): void {
    $provider = fr005DiscoveryProvider();

    Http::fake([
        $provider->metadata_url => Http::response([
            ...fr005DiscoveryDocument($provider),
            'issuer' => 'https://evil-idp.example.test',
        ], 200),
    ]);

    expect(fn () => app(ExternalIdpDiscoveryService::class)->refresh($provider))
        ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');

    Http::fake([
        $provider->metadata_url => Http::response(Arr::except(fr005DiscoveryDocument($provider), ['jwks_uri']), 200),
    ]);

    expect(fn () => app(ExternalIdpDiscoveryService::class)->refresh($provider))
        ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');

    $provider->forceFill(['metadata_url' => 'http://idp.example.test/.well-known/openid-configuration']);

    expect(fn () => app(ExternalIdpDiscoveryService::class)->refresh($provider))
        ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');
});

it('uses stale discovery cache when refresh fails after a successful fetch', function (): void {
    $provider = fr005DiscoveryProvider();
    Http::fake([
        $provider->metadata_url => Http::response(fr005DiscoveryDocument($provider), 200),
    ]);
    app(ExternalIdpDiscoveryService::class)->refresh($provider);

    Cache::forget('external-idp:discovery:'.$provider->provider_key);
    Http::fake([
        $provider->metadata_url => Http::response([], 503),
    ]);

    $metadata = app(ExternalIdpDiscoveryService::class)->refresh($provider);

    expect($metadata['issuer'])->toBe($provider->issuer)
        ->and($metadata['jwks_uri'])->toBe($provider->issuer.'/jwks');
});

it('audits discovery refresh success and failure without leaking secrets or tokens', function (): void {
    $provider = fr005DiscoveryProvider();
    Http::fake([
        $provider->metadata_url => Http::response(fr005DiscoveryDocument($provider), 200),
    ]);

    app(RefreshExternalIdpDiscoveryAction::class)->execute($provider, 'req-fr005-discovery');

    Http::fake([
        $provider->metadata_url => Http::response([], 500),
    ]);

    $failedProvider = fr005DiscoveryProvider('keycloak-secondary', 'https://idp-secondary.example.test/realms/sso');
    $failedProvider->forceFill([
        'metadata_url' => 'https://idp-secondary.example.test/realms/sso/.well-known/openid-configuration',
    ])->save();

    expect(fn () => app(RefreshExternalIdpDiscoveryAction::class)->execute($failedProvider, 'req-fr005-fail'))
        ->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.discovery_refreshed', 'external_idp.discovery_failed'])
        ->orderBy('id')
        ->get();

    expect($events)->toHaveCount(2)
        ->and($events[0]->taxonomy)->toBe('external_idp.discovery_refreshed')
        ->and($events[1]->taxonomy)->toBe('external_idp.discovery_failed')
        ->and(json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR))->not->toContain('client_secret')
        ->and(json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR))->not->toContain('id_token')
        ->and(json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR))->not->toContain('access_token');
});

function fr005DiscoveryProvider(
    string $providerKey = 'keycloak-primary',
    string $issuer = 'https://idp.example.test/realms/sso',
): ExternalIdentityProvider {
    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Primary',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-broker',
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
function fr005DiscoveryDocument(ExternalIdentityProvider $provider): array
{
    return [
        'issuer' => $provider->issuer,
        'authorization_endpoint' => $provider->issuer.'/authorize',
        'token_endpoint' => $provider->issuer.'/token',
        'userinfo_endpoint' => $provider->issuer.'/userinfo',
        'jwks_uri' => $provider->issuer.'/jwks',
        'response_types_supported' => ['code'],
        'subject_types_supported' => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
    ];
}
