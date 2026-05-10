<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\ProbeExternalIdpHealthAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpHealthProbeService;
use App\Services\System\ReadinessProbeService;
use Illuminate\Support\Facades\Http;

it('marks an enabled external idp healthy when discovery probe validates HTTPS metadata', function (): void {
    $provider = externalIdpHealthProvider('keycloak-health');
    Http::fake([$provider->metadata_url => Http::response(externalIdpHealthDiscovery($provider), 200)]);

    $result = app(ExternalIdpHealthProbeService::class)->probe($provider);
    $provider->refresh();

    expect($result['healthy'])->toBeTrue()
        ->and($result['status'])->toBe('healthy')
        ->and($result['latency_ms'])->toBeFloat()
        ->and($provider->health_status)->toBe('healthy')
        ->and($provider->last_health_checked_at)->not->toBeNull();
});

it('marks external idp unhealthy when discovery probe fails validation or transport', function (): void {
    $invalid = externalIdpHealthProvider('keycloak-invalid');
    Http::fake([$invalid->metadata_url => Http::response([
        ...externalIdpHealthDiscovery($invalid),
        'issuer' => 'https://evil.example.test',
    ], 200)]);

    $invalidResult = app(ExternalIdpHealthProbeService::class)->probe($invalid);
    $invalid->refresh();

    $transport = externalIdpHealthProvider('keycloak-transport');
    Http::fake([$transport->metadata_url => Http::response([], 503)]);

    $transportResult = app(ExternalIdpHealthProbeService::class)->probe($transport);
    $transport->refresh();

    expect($invalidResult['healthy'])->toBeFalse()
        ->and($invalidResult['status'])->toBe('unhealthy')
        ->and($invalid->health_status)->toBe('unhealthy')
        ->and($transportResult['healthy'])->toBeFalse()
        ->and($transport->health_status)->toBe('unhealthy');
});

it('does not perform network probe for disabled external idp providers', function (): void {
    $provider = externalIdpHealthProvider('keycloak-disabled', false);
    Http::fake();

    $result = app(ExternalIdpHealthProbeService::class)->probe($provider);

    expect($result['healthy'])->toBeFalse()
        ->and($result['status'])->toBe('disabled');

    Http::assertNothingSent();
});

it('exposes external idp readiness as advisory summary without failing db redis readiness', function (): void {
    config(['sso.observability.readiness_external_idp_snapshot_enabled' => true]);

    externalIdpHealthProvider('primary-healthy', true, false, 10, 'healthy');
    externalIdpHealthProvider('backup-unhealthy', true, true, 20, 'unhealthy');

    $result = app(ReadinessProbeService::class)->inspect();

    expect($result['ready'])->toBe($result['checks']['database'] && $result['checks']['redis'])
        ->and($result['checks'])->toHaveKey('external_idps')
        ->and($result['checks']['external_idps']['required_ready'])->toBeTrue()
        ->and($result['checks']['external_idps']['healthy'])->toBe(1)
        ->and($result['checks']['external_idps']['unhealthy'])->toBe(1)
        ->and($result['checks']['external_idps']['providers'][0]['provider_key'])->toBe('primary-healthy');
});

it('keeps readiness endpoint shallow even when all external idps are unhealthy', function (): void {
    config(['sso.observability.readiness_external_idp_snapshot_enabled' => true]);

    externalIdpHealthProvider('primary-unhealthy', true, false, 10, 'unhealthy');

    $result = app(ReadinessProbeService::class)->inspect();

    expect($result['ready'])->toBe($result['checks']['database'] && $result['checks']['redis'])
        ->and($result['checks']['external_idps']['required_ready'])->toBeFalse()
        ->and($result['checks']['external_idps']['any_ready'])->toBeFalse();
});

it('audits health probe success and failure without leaking sensitive provider material', function (): void {
    $healthy = externalIdpHealthProvider('keycloak-audit-healthy');
    Http::fake([$healthy->metadata_url => Http::response(externalIdpHealthDiscovery($healthy), 200)]);
    app(ProbeExternalIdpHealthAction::class)->execute($healthy, 'req-externalIdp-health');

    $unhealthy = externalIdpHealthProvider('keycloak-audit-unhealthy');
    Http::fake([$unhealthy->metadata_url => Http::response([], 503)]);
    app(ProbeExternalIdpHealthAction::class)->execute($unhealthy, 'req-externalIdp-health-fail');

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.health_healthy', 'external_idp.health_unhealthy'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.health.probe')
        ->and($events[0]->taxonomy)->toBe('external_idp.health_healthy')
        ->and($events[1]->taxonomy)->toBe('external_idp.health_unhealthy')
        ->and($encoded)->toContain('req-externalIdp-health')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('code_verifier');
});

function externalIdpHealthProvider(
    string $providerKey,
    bool $enabled = true,
    bool $isBackup = false,
    int $priority = 100,
    string $healthStatus = 'unknown',
): ExternalIdentityProvider {
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => str($providerKey)->replace('-', ' ')->title()->toString(),
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
function externalIdpHealthDiscovery(ExternalIdentityProvider $provider): array
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
