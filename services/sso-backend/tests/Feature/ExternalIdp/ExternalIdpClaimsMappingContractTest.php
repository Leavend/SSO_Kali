<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\MapExternalIdpClaimsAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalIdpClaimMapping;
use App\Models\ExternalSubjectLink;
use App\Services\ExternalIdp\ExternalIdpClaimsMapper;
use App\Services\ExternalIdp\ExternalSubjectAccountMapper;

it('maps default oidc claims into normalized external profile with safe snapshot', function (): void {
    $provider = fr005ClaimsProvider('keycloak-default');

    $mapped = app(ExternalIdpClaimsMapper::class)->map($provider, [
        'iss' => $provider->issuer,
        'sub' => 'external-sub-001',
        'email' => 'USER@Example.COM',
        'email_verified' => true,
        'name' => 'Ada Lovelace',
        'preferred_username' => 'ada',
        'access_token' => 'secret-access-token',
    ]);

    expect($mapped['provider_key'])->toBe('keycloak-default')
        ->and($mapped['subject'])->toBe('external-sub-001')
        ->and($mapped['email'])->toBe('user@example.com')
        ->and($mapped['name'])->toBe('Ada Lovelace')
        ->and($mapped['username'])->toBe('ada')
        ->and($mapped['email_verified'])->toBeTrue()
        ->and($mapped['claims'])->not->toHaveKey('access_token');
});

it('maps custom nested claims using configured paths and required guards', function (): void {
    $provider = fr005ClaimsProvider('azure-custom');
    fr005ClaimMapping($provider, [
        'subject_paths' => ['oid', 'user.id'],
        'email_paths' => ['mail', 'upn'],
        'name_paths' => ['profile.displayName'],
        'username_paths' => ['upn'],
        'required_paths' => ['oid', 'tenant.id'],
    ]);

    $mapped = app(ExternalIdpClaimsMapper::class)->map($provider, [
        'oid' => 'azure-object-id',
        'tenant' => ['id' => 'tenant-001'],
        'mail' => 'Azure.User@Example.COM',
        'email_verified' => true,
        'profile' => ['displayName' => 'Azure User'],
        'upn' => 'azure.user@example.com',
    ]);

    expect($mapped['subject'])->toBe('azure-object-id')
        ->and($mapped['email'])->toBe('azure.user@example.com')
        ->and($mapped['name'])->toBe('Azure User')
        ->and($mapped['username'])->toBe('azure.user@example.com');
});

it('rejects missing required custom claims and missing subject claim', function (): void {
    $provider = fr005ClaimsProvider('adfs-required');
    fr005ClaimMapping($provider, [
        'subject_paths' => ['custom.sub'],
        'required_paths' => ['custom.sub', 'tenant'],
    ]);

    expect(fn () => app(ExternalIdpClaimsMapper::class)->map($provider, [
        'custom' => ['sub' => 'subject-only'],
    ]))->toThrow(RuntimeException::class, 'External IdP required claim [tenant] is missing.');

    expect(fn () => app(ExternalIdpClaimsMapper::class)->map(fr005ClaimsProvider('missing-subject'), [
        'email' => 'user@example.com',
    ]))->toThrow(RuntimeException::class, 'External IdP required claim [sub] is missing.');
});

it('does not expose unverified email when verified email is required by mapping', function (): void {
    $provider = fr005ClaimsProvider('email-policy');

    $default = app(ExternalIdpClaimsMapper::class)->map($provider, [
        'sub' => 'email-policy-subject',
        'email' => 'unverified@example.com',
        'email_verified' => false,
    ]);

    fr005ClaimMapping($provider, ['require_verified_email' => false]);
    $custom = app(ExternalIdpClaimsMapper::class)->map($provider->refresh(), [
        'sub' => 'email-policy-subject',
        'email' => 'allowed@example.com',
        'email_verified' => false,
    ]);

    expect($default['email'])->toBeNull()
        ->and($custom['email'])->toBe('allowed@example.com');
});

it('integrates raw claims mapping into external subject account linking', function (): void {
    $provider = fr005ClaimsProvider('link-raw-claims');

    $result = app(ExternalSubjectAccountMapper::class)->map($provider, [
        'raw_claims' => [
            'sub' => 'raw-subject-001',
            'email' => 'Raw.User@Example.COM',
            'email_verified' => true,
            'name' => 'Raw User',
            'id_token' => 'secret-id-token',
        ],
    ]);

    $link = ExternalSubjectLink::query()->where('provider_key', 'link-raw-claims')->firstOrFail();

    expect($result['created_user'])->toBeTrue()
        ->and($link->external_subject)->toBe('raw-subject-001')
        ->and($link->email)->toBe('raw.user@example.com')
        ->and($link->last_claims_snapshot)->not->toHaveKey('id_token');
});

it('audits claims mapping success and failure without leaking sensitive claim material', function (): void {
    $provider = fr005ClaimsProvider('claims-audit');
    app(MapExternalIdpClaimsAction::class)->execute($provider, [
        'sub' => 'audit-subject',
        'email' => 'audit@example.com',
        'email_verified' => true,
        'access_token' => 'secret-access-token',
    ], 'req-fr005-claims');

    expect(fn () => app(MapExternalIdpClaimsAction::class)->execute($provider, [
        'access_token' => 'secret-access-token',
    ], 'req-fr005-claims-fail'))->toThrow(RuntimeException::class);

    $events = AdminAuditEvent::query()
        ->whereIn('taxonomy', ['external_idp.claims_mapped', 'external_idp.claims_mapping_failed'])
        ->orderBy('id')
        ->get();
    $encoded = json_encode($events->pluck('context')->all(), JSON_THROW_ON_ERROR);

    expect($events)->toHaveCount(2)
        ->and($events[0]->action)->toBe('external_idp.claims.map')
        ->and($events[0]->context['subject'])->toBe('audit-subject')
        ->and($events[1]->taxonomy)->toBe('external_idp.claims_mapping_failed')
        ->and($encoded)->toContain('req-fr005-claims')
        ->and($encoded)->not->toContain('secret-access-token')
        ->and($encoded)->not->toContain('access_token')
        ->and($encoded)->not->toContain('refresh_token')
        ->and($encoded)->not->toContain('id_token')
        ->and($encoded)->not->toContain('code_verifier');
});

function fr005ClaimsProvider(string $providerKey): ExternalIdentityProvider
{
    $issuer = 'https://'.$providerKey.'.idp.example.test/realms/sso';

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
        'enabled' => true,
        'is_backup' => false,
        'priority' => 100,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);
}

/**
 * @param  array<string, mixed>  $overrides
 */
function fr005ClaimMapping(ExternalIdentityProvider $provider, array $overrides = []): ExternalIdpClaimMapping
{
    return ExternalIdpClaimMapping::query()->create([
        'external_identity_provider_id' => $provider->id,
        'provider_key' => $provider->provider_key,
        'subject_paths' => $overrides['subject_paths'] ?? ['sub'],
        'email_paths' => $overrides['email_paths'] ?? ['email'],
        'name_paths' => $overrides['name_paths'] ?? ['name'],
        'username_paths' => $overrides['username_paths'] ?? ['preferred_username', 'email'],
        'required_paths' => $overrides['required_paths'] ?? ['sub'],
        'require_verified_email' => $overrides['require_verified_email'] ?? true,
        'enabled' => $overrides['enabled'] ?? true,
    ]);
}
