<?php

declare(strict_types=1);

use App\Actions\Admin\RotateClientSecretAction;
use App\Models\AdminAuditEvent;
use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    config()->set('sso.client_secret.ttl_days', 90);
    config()->set('sso.client_secret.plaintext_length', 64);
    config()->set('sso.client_secret_hash.memory_cost', 19456);
    config()->set('sso.client_secret_hash.time_cost', 3);
    config()->set('sso.client_secret_hash.threads', 1);
});

/**
 * Create a confidential client registration with an existing secret hash.
 */
function fr009ConfidentialRegistration(string $clientId = 'fr009-confidential'): OidcClientRegistration
{
    return OidcClientRegistration::query()->create([
        'client_id' => $clientId,
        'display_name' => 'FR-009 Test Client',
        'type' => 'confidential',
        'environment' => 'live',
        'app_base_url' => 'https://fr009.example.test',
        'redirect_uris' => ['https://fr009.example.test/auth/callback'],
        'post_logout_redirect_uris' => ['https://fr009.example.test/'],
        'allowed_scopes' => ['openid', 'profile', 'email'],
        'backchannel_logout_uri' => null,
        'secret_hash' => app(ClientSecretHashPolicy::class)->make('initial-secret-plaintext'),
        'owner_email' => 'owner@example.test',
        'provisioning' => 'jit',
        'contract' => ['fake' => true],
        'status' => 'active',
    ]);
}

function fr009PublicRegistration(string $clientId = 'fr009-public'): OidcClientRegistration
{
    return OidcClientRegistration::query()->create([
        'client_id' => $clientId,
        'display_name' => 'FR-009 Public Client',
        'type' => 'public',
        'environment' => 'live',
        'app_base_url' => 'https://fr009pub.example.test',
        'redirect_uris' => ['https://fr009pub.example.test/auth/callback'],
        'post_logout_redirect_uris' => ['https://fr009pub.example.test/'],
        'allowed_scopes' => ['openid'],
        'backchannel_logout_uri' => null,
        'secret_hash' => null,
        'owner_email' => 'owner@example.test',
        'provisioning' => 'jit',
        'contract' => ['fake' => true],
        'status' => 'active',
    ]);
}

function fr009Admin(): User
{
    return User::factory()->create([
        'email' => 'fr009-admin@example.test',
        'role' => 'admin',
    ]);
}

function fr009Request(): Request
{
    return Request::create('https://api-sso.timeh.my.id/admin/api/clients/xyz/rotate-secret', 'POST');
}

it('rotates a confidential client secret and returns plaintext once', function (): void {
    $registration = fr009ConfidentialRegistration();
    $originalHash = $registration->secret_hash;

    $result = app(RotateClientSecretAction::class)->execute(
        fr009Request(),
        fr009Admin(),
        $registration->client_id,
    );

    expect($result['plaintext_once'])->toBeString()->toHaveLength(64)
        ->and($result['client_id'])->toBe($registration->client_id)
        ->and($result['rotated_at'])->toBeString()
        ->and($result['expires_at'])->toBeString();

    $registration->refresh();
    expect($registration->secret_hash)->not->toBe($originalHash)
        ->and($registration->secret_rotated_at)->not->toBeNull()
        ->and($registration->secret_expires_at)->not->toBeNull();

    // Verify the new plaintext actually matches the stored hash.
    expect(
        app(ClientSecretHashPolicy::class)->verify($result['plaintext_once'], $registration->secret_hash),
    )->toBeTrue();
});

it('sets secret_expires_at to now + ttl days', function (): void {
    $registration = fr009ConfidentialRegistration();

    $result = app(RotateClientSecretAction::class)->execute(
        fr009Request(),
        fr009Admin(),
        $registration->client_id,
    );

    $rotatedAt = \Illuminate\Support\Carbon::parse($result['rotated_at']);
    $expiresAt = \Illuminate\Support\Carbon::parse($result['expires_at']);

    expect($expiresAt->diffInDays($rotatedAt, true))->toBe(90.0);
});

it('rejects rotation for public clients', function (): void {
    $registration = fr009PublicRegistration();

    $action = app(RotateClientSecretAction::class);

    expect(fn () => $action->execute(fr009Request(), fr009Admin(), $registration->client_id))
        ->toThrow(\DomainException::class, 'Only confidential clients');
});

it('rejects rotation for unknown clients', function (): void {
    $action = app(RotateClientSecretAction::class);

    expect(fn () => $action->execute(fr009Request(), fr009Admin(), 'does-not-exist'))
        ->toThrow(\DomainException::class, 'not found');
});

it('flushes the downstream client registry cache after rotation', function (): void {
    $registration = fr009ConfidentialRegistration();
    $registry = app(DownstreamClientRegistry::class);

    // Warm the cache
    $registry->find($registration->client_id);

    app(RotateClientSecretAction::class)->execute(
        fr009Request(),
        fr009Admin(),
        $registration->client_id,
    );

    $registration->refresh();
    // After flush, the registry should return the fresh client with the new hash.
    $client = $registry->find($registration->client_id);
    expect($client)->not->toBeNull()
        ->and($client->secret)->toBe($registration->secret_hash);
});

it('records an audit event with taxonomy client_secret_rotated', function (): void {
    $registration = fr009ConfidentialRegistration();

    app(RotateClientSecretAction::class)->execute(
        fr009Request(),
        fr009Admin(),
        $registration->client_id,
    );

    $event = AdminAuditEvent::query()
        ->where('action', 'rotate_client_secret')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->taxonomy)->toBe(AdminAuditTaxonomy::CLIENT_SECRET_ROTATED);
});

it('never returns the previous plaintext after rotation', function (): void {
    $registration = fr009ConfidentialRegistration();

    $result = app(RotateClientSecretAction::class)->execute(
        fr009Request(),
        fr009Admin(),
        $registration->client_id,
    );

    // The new plaintext MUST NOT equal any known prior value.
    expect($result['plaintext_once'])->not->toBe('initial-secret-plaintext');

    $registration->refresh();
    expect(
        app(ClientSecretHashPolicy::class)->verify('initial-secret-plaintext', $registration->secret_hash),
    )->toBeFalse();
});
