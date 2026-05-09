<?php

declare(strict_types=1);

use App\Actions\ExternalIdp\CreateExternalIdentityProviderAction;
use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Services\ExternalIdp\ExternalIdentityProviderRegistry;
use Illuminate\Support\Facades\Crypt;

it('creates an external idp registry record with secure production defaults', function (): void {
    $provider = app(CreateExternalIdentityProviderAction::class)->execute(fr005ExternalIdpPayload());

    expect($provider)->toBeInstanceOf(ExternalIdentityProvider::class)
        ->and($provider->provider_key)->toBe('keycloak-primary')
        ->and($provider->issuer)->toBe('https://idp.example.test/realms/sso')
        ->and($provider->metadata_url)->toBe('https://idp.example.test/realms/sso/.well-known/openid-configuration')
        ->and($provider->allowed_algorithms)->toBe(['RS256'])
        ->and($provider->scopes)->toBe(['openid', 'profile', 'email'])
        ->and($provider->enabled)->toBeFalse()
        ->and($provider->is_backup)->toBeFalse()
        ->and($provider->priority)->toBe(100)
        ->and($provider->tls_validation_enabled)->toBeTrue()
        ->and($provider->signature_validation_enabled)->toBeTrue()
        ->and($provider->health_status)->toBe('unknown')
        ->and($provider->client_secret_encrypted)->not->toBe('super-secret-idp-client-secret')
        ->and(Crypt::decryptString((string) $provider->client_secret_encrypted))->toBe('super-secret-idp-client-secret');
});

it('rejects non-https issuer and metadata urls', function (): void {
    $registry = app(ExternalIdentityProviderRegistry::class);

    expect(fn () => $registry->create([
        ...fr005ExternalIdpPayload(),
        'issuer' => 'http://idp.example.test/realms/sso',
    ]))->toThrow(InvalidArgumentException::class, 'issuer must use HTTPS.');

    expect(fn () => $registry->create([
        ...fr005ExternalIdpPayload(),
        'provider_key' => 'keycloak-secondary',
        'issuer' => 'https://secondary-idp.example.test/realms/sso',
        'metadata_url' => 'http://secondary-idp.example.test/.well-known/openid-configuration',
    ]))->toThrow(InvalidArgumentException::class, 'metadata_url must use HTTPS.');
});

it('returns a public registry view without leaking client secret material', function (): void {
    $provider = app(CreateExternalIdentityProviderAction::class)->execute(fr005ExternalIdpPayload());
    $view = app(ExternalIdentityProviderRegistry::class)->publicView($provider);
    $encoded = json_encode($view, JSON_THROW_ON_ERROR);

    expect($view)->toHaveKey('has_client_secret', true)
        ->and($view)->not->toHaveKey('client_secret')
        ->and($view)->not->toHaveKey('client_secret_encrypted')
        ->and($encoded)->not->toContain('super-secret-idp-client-secret');
});

it('writes redacted tamper-evident audit evidence when registering an external idp', function (): void {
    app(CreateExternalIdentityProviderAction::class)->execute(fr005ExternalIdpPayload());

    $event = AdminAuditEvent::query()
        ->where('taxonomy', 'external_idp.registry_created')
        ->latest('id')
        ->firstOrFail();
    $context = $event->context;
    $encoded = json_encode($context, JSON_THROW_ON_ERROR);

    expect($event->action)->toBe('external_idp.create')
        ->and($event->admin_subject_id)->toBe('admin-fr005')
        ->and($event->event_hash)->not->toBe('')
        ->and($context['provider_key'])->toBe('keycloak-primary')
        ->and($context['issuer'])->toBe('https://idp.example.test/realms/sso')
        ->and($context['has_client_secret'])->toBeTrue()
        ->and($encoded)->not->toContain('super-secret-idp-client-secret')
        ->and($encoded)->not->toContain('client_secret_encrypted');
});

/**
 * @return array<string, mixed>
 */
function fr005ExternalIdpPayload(): array
{
    return [
        'provider_key' => 'keycloak-primary',
        'display_name' => 'Keycloak Primary',
        'issuer' => 'https://idp.example.test/realms/sso',
        'metadata_url' => 'https://idp.example.test/realms/sso/.well-known/openid-configuration',
        'client_id' => 'sso-broker',
        'client_secret' => 'super-secret-idp-client-secret',
        'created_by_subject_id' => 'admin-fr005',
        'created_by_email' => 'admin-fr005@example.test',
        'created_by_role' => 'super-admin',
    ];
}
