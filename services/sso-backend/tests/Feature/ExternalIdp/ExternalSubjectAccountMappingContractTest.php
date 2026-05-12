<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\LinkExternalSubjectAccountAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\User;
use App\Services\ExternalIdp\ExternalSubjectAccountMapper;

it('creates a new local external user and durable subject link from verified external claims', function (): void {
    $provider = externalIdpMappingProvider();

    $result = app(ExternalSubjectAccountMapper::class)->map($provider, externalIdpExchangeClaims());

    expect($result['created_user'])->toBeTrue()
        ->and($result['created_link'])->toBeTrue()
        ->and($result['user'])->toBeInstanceOf(User::class)
        ->and($result['user']->email)->toBe('external@example.com')
        ->and($result['user']->display_name)->toBe('External User')
        ->and($result['user']->local_account_enabled)->toBeFalse()
        ->and($result['user']->email_verified_at)->not->toBeNull()
        ->and($result['link']->provider_key)->toBe($provider->provider_key)
        ->and($result['link']->external_subject)->toBe('external-user-1')
        ->and($result['link']->last_claims_snapshot)->toHaveKey('email_verified')
        ->and($result['link']->last_claims_snapshot)->not->toHaveKey('access_token');
});

it('links verified external subject to an existing local account and remains idempotent', function (): void {
    $provider = externalIdpMappingProvider();
    $user = User::factory()->create([
        'email' => 'external@example.com',
        'display_name' => 'Existing User',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    $first = app(ExternalSubjectAccountMapper::class)->map($provider, externalIdpExchangeClaims());
    $second = app(ExternalSubjectAccountMapper::class)->map($provider, [
        ...externalIdpExchangeClaims(),
        'name' => 'External User Updated',
        'claims' => [...externalIdpExchangeClaims()['claims'], 'name' => 'External User Updated'],
    ]);

    expect($first['created_user'])->toBeFalse()
        ->and($first['created_link'])->toBeTrue()
        ->and($first['user']->id)->toBe($user->id)
        ->and($second['created_user'])->toBeFalse()
        ->and($second['created_link'])->toBeFalse()
        ->and($second['user']->id)->toBe($user->id)
        ->and(ExternalSubjectLink::query()->where('provider_key', $provider->provider_key)->where('external_subject', 'external-user-1')->count())->toBe(1)
        ->and($second['link']->display_name)->toBe('External User Updated');
});

it('prevents email takeover when external email is unverified and rejects provider mismatch', function (): void {
    $provider = externalIdpMappingProvider();
    User::factory()->create([
        'email' => 'external@example.com',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    expect(fn () => app(ExternalSubjectAccountMapper::class)->map($provider, [
        ...externalIdpExchangeClaims(),
        'claims' => [...externalIdpExchangeClaims()['claims'], 'email_verified' => false],
    ]))->toThrow(RuntimeException::class, 'External IdP email must be verified before linking an existing account.');

    expect(fn () => app(ExternalSubjectAccountMapper::class)->map($provider, [
        ...externalIdpExchangeClaims(),
        'provider_key' => 'other-provider',
    ]))->toThrow(RuntimeException::class, 'External IdP exchange provider mismatch.');
});

it('rejects disabled local account already linked to an external subject', function (): void {
    $provider = externalIdpMappingProvider();
    $user = User::factory()->create([
        'email' => 'disabled@example.com',
        'status' => 'disabled',
        'disabled_at' => now(),
        'local_account_enabled' => false,
    ]);
    ExternalSubjectLink::query()->create([
        'user_id' => $user->id,
        'external_identity_provider_id' => $provider->id,
        'provider_key' => $provider->provider_key,
        'issuer' => $provider->issuer,
        'external_subject' => 'external-user-1',
        'email' => 'disabled@example.com',
        'last_claims_snapshot' => [],
        'last_login_at' => now(),
    ]);

    expect(fn () => app(ExternalSubjectAccountMapper::class)->map($provider, externalIdpExchangeClaims()))
        ->toThrow(RuntimeException::class, 'Mapped local account is disabled.');
});

it('audits account mapping success and failure without leaking token material', function (): void {
    $provider = externalIdpMappingProvider();

    app(LinkExternalSubjectAccountAction::class)->execute($provider, [
        ...externalIdpExchangeClaims(),
        'claims' => [...externalIdpExchangeClaims()['claims'], 'access_token' => 'must-not-leak'],
    ], 'req-externalIdp-link');

    expect(fn () => app(LinkExternalSubjectAccountAction::class)->execute($provider, [
        ...externalIdpExchangeClaims(),
        'provider_key' => 'wrong-provider',
        'claims' => [...externalIdpExchangeClaims()['claims'], 'id_token' => 'must-not-leak'],
    ], 'req-externalIdp-link-fail'))->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.account_linked', 'external_idp.account_link_failed'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.account.link')
        ->and($events[0]->context['external_subject'])->toBe('external-user-1')
        ->and($events[0]->context['created_user'])->toBeTrue()
        ->and($events[0]->context['created_link'])->toBeTrue()
        ->and($events[1]->taxonomy)->toBe('external_idp.account_link_failed')
        ->and($encoded)->toContain('req-externalIdp-link')
        ->and($encoded)->not->toContain('must-not-leak')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('code_verifier');
});

function externalIdpMappingProvider(string $providerKey = 'keycloak-mapping'): ExternalIdentityProvider
{
    $issuer = 'https://'.$providerKey.'.keycloak.example.test/realms/sso';

    return ExternalIdentityProvider::query()->create([
        'provider_key' => $providerKey,
        'display_name' => 'Keycloak Mapping',
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
 * @return array{provider_key: string, subject: string, email: string, name: string, return_to: string, claims: array<string, mixed>}
 */
function externalIdpExchangeClaims(): array
{
    return [
        'provider_key' => 'keycloak-mapping',
        'subject' => 'external-user-1',
        'email' => 'external@example.com',
        'name' => 'External User',
        'return_to' => '/admin/external-idps',
        'claims' => [
            'iss' => 'https://keycloak-mapping.keycloak.example.test/realms/sso',
            'sub' => 'external-user-1',
            'aud' => 'sso-upstream',
            'email' => 'external@example.com',
            'email_verified' => true,
            'name' => 'External User',
        ],
    ];
}
