<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\SelectExternalIdpForAuthenticationAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpFailoverPolicy;

it('selects the highest priority healthy primary provider before backup providers', function (): void {
    externalIdpFailoverProvider('primary-slow', false, 50, 'healthy');
    externalIdpFailoverProvider('backup-fast', true, 1, 'healthy');
    externalIdpFailoverProvider('primary-fast', false, 10, 'healthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select();

    expect($selection['provider']->provider_key)->toBe('primary-fast')
        ->and($selection['mode'])->toBe('primary')
        ->and($selection['candidates'])->toHaveCount(3)
        ->and($selection['candidates'][0]['provider_key'])->toBe('primary-fast');
});

it('fails over to the highest priority backup provider when primaries are unhealthy or disabled', function (): void {
    externalIdpFailoverProvider('primary-disabled', false, 1, 'healthy', false);
    externalIdpFailoverProvider('primary-unhealthy', false, 2, 'unhealthy');
    externalIdpFailoverProvider('backup-slow', true, 50, 'healthy');
    externalIdpFailoverProvider('backup-fast', true, 5, 'unknown');

    $selection = app(ExternalIdpFailoverPolicy::class)->select();

    expect($selection['provider']->provider_key)->toBe('backup-fast')
        ->and($selection['provider']->is_backup)->toBeTrue()
        ->and($selection['mode'])->toBe('backup_failover')
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->toBe(['backup-fast', 'backup-slow']);
});

it('honors an explicitly preferred eligible provider without bypassing health and enabled policy', function (): void {
    externalIdpFailoverProvider('primary-fast', false, 1, 'healthy');
    externalIdpFailoverProvider('backup-preferred', true, 100, 'healthy');
    externalIdpFailoverProvider('backup-unhealthy', true, 1, 'unhealthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select('backup-preferred');
    $fallback = app(ExternalIdpFailoverPolicy::class)->select('backup-unhealthy');

    expect($selection['provider']->provider_key)->toBe('backup-preferred')
        ->and($selection['mode'])->toBe('preferred_backup')
        ->and($fallback['provider']->provider_key)->toBe('primary-fast')
        ->and($fallback['mode'])->toBe('primary');
});

it('fails closed when every external idp provider is unavailable', function (): void {
    externalIdpFailoverProvider('primary-unhealthy', false, 1, 'unhealthy');
    externalIdpFailoverProvider('backup-disabled', true, 1, 'healthy', false);

    expect(fn () => app(ExternalIdpFailoverPolicy::class)->select())
        ->toThrow(RuntimeException::class, 'No healthy external IdP provider is available.');
});

it('audits failover selection success and unavailable failure without leaking secret material', function (): void {
    externalIdpFailoverProvider('primary-fast', false, 1, 'healthy');
    app(SelectExternalIdpForAuthenticationAction::class)->execute('primary-fast', 'req-externalIdp-failover');

    ExternalIdentityProvider::query()->delete();
    externalIdpFailoverProvider('backup-unhealthy', true, 1, 'unhealthy');

    expect(fn () => app(SelectExternalIdpForAuthenticationAction::class)->execute(null, 'req-externalIdp-failover-fail'))
        ->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.failover_selected', 'external_idp.failover_unavailable'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.failover.select')
        ->and($events[0]->context['selected_provider_key'])->toBe('primary-fast')
        ->and($events[0]->context['mode'])->toBe('preferred_primary')
        ->and($events[1]->taxonomy)->toBe('external_idp.failover_unavailable')
        ->and($encoded)->toContain('req-externalIdp-failover')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('code_verifier');
});

it('uses deterministic provider key ordering when eligible providers share the same priority', function (): void {
    externalIdpFailoverProvider('primary-zulu', false, 10, 'healthy');
    externalIdpFailoverProvider('primary-alpha', false, 10, 'healthy');
    externalIdpFailoverProvider('backup-alpha', true, 10, 'healthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select();

    expect($selection['provider']->provider_key)->toBe('primary-alpha')
        ->and($selection['mode'])->toBe('primary')
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->toBe([
            'primary-alpha',
            'primary-zulu',
            'backup-alpha',
        ]);
});

it('excludes disabled and unhealthy providers from failover candidate summaries', function (): void {
    externalIdpFailoverProvider('primary-disabled', false, 1, 'healthy', false);
    externalIdpFailoverProvider('primary-unhealthy', false, 2, 'unhealthy');
    externalIdpFailoverProvider('primary-unknown', false, 3, 'unknown');
    externalIdpFailoverProvider('backup-healthy', true, 4, 'healthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select();

    expect($selection['provider']->provider_key)->toBe('primary-unknown')
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->toBe([
            'primary-unknown',
            'backup-healthy',
        ])
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->not->toContain('primary-disabled')
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->not->toContain('primary-unhealthy');
});

it('falls back to policy ordering when the preferred provider key is missing', function (): void {
    externalIdpFailoverProvider('primary-fast', false, 1, 'healthy');
    externalIdpFailoverProvider('backup-fast', true, 1, 'healthy');

    $selection = app(ExternalIdpFailoverPolicy::class)->select('missing-provider');

    expect($selection['provider']->provider_key)->toBe('primary-fast')
        ->and($selection['mode'])->toBe('primary')
        ->and(collect($selection['candidates'])->pluck('provider_key')->all())->toBe([
            'primary-fast',
            'backup-fast',
        ]);
});

it('keeps failover audit candidates limited to operational metadata', function (): void {
    externalIdpFailoverProvider('primary-fast', false, 1, 'healthy');
    externalIdpFailoverProvider('backup-fast', true, 2, 'healthy');

    app(SelectExternalIdpForAuthenticationAction::class)->execute(null, 'req-externalIdp-failover-candidates');

    $event = AdminAuditEvent::query()
        ->where('taxonomy', 'external_idp.failover_selected')
        ->latest('id')
        ->firstOrFail();
    $encoded = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->context['candidates'])->toHaveCount(2)
        ->and($event->context['candidates'][0])->toHaveKeys([
            'provider_key',
            'is_backup',
            'priority',
            'health_status',
        ])
        ->and($event->context['candidates'][0])->not->toHaveKey('client_id')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('authorization_endpoint')
        ->and($encoded)->not->toContain('token_endpoint')
        ->and($encoded)->not->toContain('jwks_uri');
});

function externalIdpFailoverProvider(
    string $providerKey,
    bool $isBackup,
    int $priority,
    string $healthStatus,
    bool $enabled = true,
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
