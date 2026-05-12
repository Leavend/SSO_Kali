<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\CreateExternalIdpAuthenticationRedirectAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdpAuthenticationRedirectService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);
});

it('creates an OIDC conformant external idp authorization redirect with state nonce and pkce cache', function (): void {
    $provider = externalIdpAuthRedirectProvider();
    Http::fake([$provider->metadata_url => Http::response(externalIdpAuthRedirectDiscovery($provider), 200)]);

    $redirect = app(ExternalIdpAuthenticationRedirectService::class)->create($provider, [
        'request_id' => 'req-externalIdp-auth',
        'return_to' => '/admin/external-idps',
        'login_hint' => 'user@example.com',
        'prompt' => 'login',
    ]);
    $parts = parse_url($redirect['redirect_url']);
    parse_str((string) ($parts['query'] ?? ''), $query);
    $stored = app(ExternalIdpAuthenticationRedirectService::class)->peek($redirect['state']);

    expect($parts['scheme'])->toBe('https')
        ->and($parts['host'])->toBe('keycloak.example.test')
        ->and($query['client_id'])->toBe('sso-upstream')
        ->and($query['redirect_uri'])->toBe('https://api-sso.timeh.my.id/external-idp/callback')
        ->and($query['response_type'])->toBe('code')
        ->and($query['scope'])->toBe('openid profile email')
        ->and($query['state'])->toBe($redirect['state'])
        ->and($query['nonce'])->toBe($redirect['nonce'])
        ->and($query['code_challenge_method'])->toBe('S256')
        ->and($query['code_challenge'])->toBeString()->not->toBe('')
        ->and($query['login_hint'])->toBe('user@example.com')
        ->and($query['prompt'])->toBe('login')
        ->and($stored['provider_key'])->toBe('keycloak-primary')
        ->and($stored['issuer'])->toBe($provider->issuer)
        ->and($stored['nonce'])->toBe($redirect['nonce'])
        ->and($stored['code_verifier'])->toBeString()->not->toBe('')
        ->and($stored['return_to'])->toBe('/admin/external-idps');
});

it('rejects disabled unhealthy and non-https callback or authorization endpoints', function (): void {
    $provider = externalIdpAuthRedirectProvider();
    Http::fake([$provider->metadata_url => Http::response(externalIdpAuthRedirectDiscovery($provider), 200)]);

    $provider->forceFill(['enabled' => false]);
    expect(fn () => app(ExternalIdpAuthenticationRedirectService::class)->create($provider))
        ->toThrow(RuntimeException::class, 'External IdP is disabled.');

    $provider = externalIdpAuthRedirectProvider('keycloak-unhealthy');
    $provider->forceFill(['health_status' => 'unhealthy']);
    expect(fn () => app(ExternalIdpAuthenticationRedirectService::class)->create($provider))
        ->toThrow(RuntimeException::class, 'External IdP is unhealthy.');

    $provider = externalIdpAuthRedirectProvider('keycloak-bad-callback');
    Http::fake([$provider->metadata_url => Http::response(externalIdpAuthRedirectDiscovery($provider), 200)]);
    config(['sso.external_idp.callback_url' => 'http://api-sso.timeh.my.id/external-idp/callback']);
    expect(fn () => app(ExternalIdpAuthenticationRedirectService::class)->create($provider))
        ->toThrow(RuntimeException::class, 'External IdP callback URL must use HTTPS.');

    $provider = externalIdpAuthRedirectProvider('keycloak-bad-auth');
    Http::fake([$provider->metadata_url => Http::response([
        ...externalIdpAuthRedirectDiscovery($provider),
        'authorization_endpoint' => 'http://keycloak.example.test/auth',
    ], 200)]);
    config(['sso.external_idp.callback_url' => 'https://api-sso.timeh.my.id/external-idp/callback']);

    expect(fn () => app(ExternalIdpAuthenticationRedirectService::class)->create($provider))
        ->toThrow(RuntimeException::class, 'External IdP discovery could not be refreshed.');
});

it('audits external idp auth redirect success and failure without leaking sensitive material', function (): void {
    $provider = externalIdpAuthRedirectProvider();
    Http::fake([$provider->metadata_url => Http::response(externalIdpAuthRedirectDiscovery($provider), 200)]);

    app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($provider, [
        'request_id' => 'req-externalIdp-auth',
        'return_to' => '/admin/external-idps',
        'login_hint' => 'user@example.com',
        'id_token' => 'must-not-leak',
        'client_secret' => 'must-not-leak',
    ]);

    $failed = externalIdpAuthRedirectProvider('keycloak-disabled');
    $failed->forceFill(['enabled' => false]);
    expect(fn () => app(CreateExternalIdpAuthenticationRedirectAction::class)->execute($failed, [
        'request_id' => 'req-externalIdp-auth-fail',
        'access_token' => 'must-not-leak',
    ]))->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.auth_redirect_created', 'external_idp.auth_redirect_failed'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.auth.redirect')
        ->and($events[1]->taxonomy)->toBe('external_idp.auth_redirect_failed')
        ->and($encoded)->toContain('req-externalIdp-auth')
        ->and($encoded)->not->toContain('must-not-leak')
        ->and($encoded)->not->toContain('client_secret')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('code_verifier');
});

function externalIdpAuthRedirectProvider(string $providerKey = 'keycloak-primary'): ExternalIdentityProvider
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Primary',
        'issuer' => $issuer,
        'metadata_url' => $issuer.'/.well-known/openid-configuration',
        'client_id' => 'sso-upstream',
        'client_secret_encrypted' => null,
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'enabled' => true,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);
}

/**
 * @return array<string, mixed>
 */
function externalIdpAuthRedirectDiscovery(ExternalIdentityProvider $provider): array
{
    return [
        'issuer' => $provider->issuer,
        'authorization_endpoint' => 'https://keycloak.example.test/realms/sso/protocol/openid-connect/auth',
        'token_endpoint' => 'https://keycloak.example.test/realms/sso/protocol/openid-connect/token',
        'userinfo_endpoint' => 'https://keycloak.example.test/realms/sso/protocol/openid-connect/userinfo',
        'jwks_uri' => 'https://keycloak.example.test/realms/sso/protocol/openid-connect/certs',
        'response_types_supported' => ['code'],
        'subject_types_supported' => ['public'],
        'id_token_signing_alg_values_supported' => ['RS256'],
    ];
}
