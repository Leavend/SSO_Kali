<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\ProbeExternalIdpHealthAction;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpFailoverPolicy;
use Illuminate\Support\Facades\Http;

it('opens the circuit breaker after consecutive probe failures and pulls the provider out of the failover pool', function (): void {
    config()->set('sso.external_idp.failure_threshold', 2);

    $primary = circuitBreakerProvider('primary-broken', false, 1, 'unknown');
    circuitBreakerProvider('backup-ok', true, 1, 'healthy');

    Http::fake([
        $primary->metadata_url => Http::response(['error' => 'unavailable'], 503),
    ]);

    $action = app(ProbeExternalIdpHealthAction::class);

    $first = $action->execute($primary->fresh(), 'req-circuit-breaker');
    $second = $action->execute($primary->fresh(), 'req-circuit-breaker');

    expect($first['breaker_tripped'])->toBeFalse()
        ->and($first['consecutive_failures'])->toBe(1)
        ->and($second['breaker_tripped'])->toBeTrue()
        ->and($second['consecutive_failures'])->toBe(2);

    $primary->refresh();
    expect($primary->breaker_tripped_at)->not->toBeNull()
        ->and($primary->breaker_reason)->not->toBeNull();

    $selection = app(ExternalIdpFailoverPolicy::class)->select();
    expect($selection['provider']->provider_key)->toBe('backup-ok')
        ->and($selection['mode'])->toBe('backup_failover');
});

it('resets the circuit breaker on the next successful probe', function (): void {
    config()->set('sso.external_idp.failure_threshold', 1);

    $provider = circuitBreakerProvider('primary-flaky', false, 1, 'unknown');
    Http::fake([
        $provider->metadata_url => Http::sequence()
            ->push(['error' => 'unavailable'], 503)
            ->push(circuitBreakerDiscovery($provider), 200),
    ]);

    $action = app(ProbeExternalIdpHealthAction::class);
    $tripped = $action->execute($provider->fresh(), 'req-flaky');
    $recovered = $action->execute($provider->fresh(), 'req-flaky');

    expect($tripped['breaker_tripped'])->toBeTrue()
        ->and($recovered['breaker_tripped'])->toBeFalse()
        ->and($recovered['consecutive_failures'])->toBe(0);

    $fresh = $provider->fresh();
    expect($fresh->breaker_tripped_at)->toBeNull()
        ->and($fresh->breaker_reason)->toBeNull();
});

it('rejects manual disable immediately so disabled providers never reach failover selection', function (): void {
    circuitBreakerProvider('primary-disabled', false, 1, 'healthy', false);
    circuitBreakerProvider('backup-active', true, 5, 'healthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select();

    expect($selection['provider']->provider_key)->toBe('backup-active')
        ->and($selection['mode'])->toBe('backup_failover');
});

function circuitBreakerProvider(
    string $providerKey,
    bool $isBackup,
    int $priority,
    string $healthStatus,
    bool $enabled = true,
): ExternalIdentityProvider {
    $issuer = 'https://'.$providerKey.'.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => str($providerKey)->replace('-', ' ')->title()->toString(),
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret_encrypted' => null,
        'authorization_endpoint' => $issuer.'/auth',
        'token_endpoint' => $issuer.'/token',
        'userinfo_endpoint' => $issuer.'/userinfo',
        'jwks_uri' => $issuer.'/jwks',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => $enabled,
        'is_backup' => $isBackup,
        'priority' => $priority,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => $healthStatus,
    ]);
}

/**
 * @return array<string, mixed>
 */
function circuitBreakerDiscovery(ExternalIdentityProvider $provider): array
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
