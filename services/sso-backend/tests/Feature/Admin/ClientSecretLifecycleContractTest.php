<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Carbon;

/**
 * FR-009 / UC-05 / UC-61: Client Secret Lifecycle contract tests.
 *
 * Covers:
 *   - Rotation endpoint returns plaintext_once + timestamps
 *   - Public clients are rejected (422)
 *   - Expired secrets are rejected at token endpoint (ISSUE-01)
 *   - Secret expiry is enforced after rotation
 */
beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://dev-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients', [
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://dev-sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://dev-sso.timeh.my.id'],
            'backchannel_logout_uri' => 'https://dev-sso.timeh.my.id/auth/backchannel/logout',
        ],
    ]);

    $this->admin = User::factory()->create([
        'subject_id' => 'fr009-admin-subject',
        'subject_uuid' => 'fr009-admin-subject',
        'role' => 'admin',
    ]);

    $this->confidentialClient = OidcClientRegistration::query()->create([
        'client_id' => 'fr009-confidential-test',
        'display_name' => 'FR-009 Confidential',
        'type' => 'confidential',
        'environment' => 'test',
        'app_base_url' => 'https://app.fr009.test',
        'redirect_uris' => ['https://app.fr009.test/callback'],
        'post_logout_redirect_uris' => ['https://app.fr009.test/'],
        'owner_email' => 'admin-fr009@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'secret_hash' => password_hash('old-secret-value-64chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxx', PASSWORD_ARGON2ID),
    ]);

    $this->publicClient = OidcClientRegistration::query()->create([
        'client_id' => 'fr009-public-test',
        'display_name' => 'FR-009 Public',
        'type' => 'public',
        'environment' => 'test',
        'app_base_url' => 'https://spa.fr009.test',
        'redirect_uris' => ['https://spa.fr009.test/callback'],
        'post_logout_redirect_uris' => ['https://spa.fr009.test/'],
        'owner_email' => 'admin-fr009@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
    ]);
});

it('rejects rotation for public clients', function (): void {
    $this->withToken(fr009AdminToken($this->admin))
        ->postJson('/admin/api/clients/fr009-public-test/rotate-secret')
        ->assertStatus(422);
});

it('rejects unauthenticated rotation requests', function (): void {
    $this->postJson('/admin/api/clients/fr009-confidential-test/rotate-secret')
        ->assertStatus(401);
});

it('rotates secret and returns plaintext_once with timestamps', function (): void {
    $response = $this->withToken(fr009AdminToken($this->admin))
        ->postJson('/admin/api/clients/fr009-confidential-test/rotate-secret');

    $response->assertOk()
        ->assertJsonStructure([
            'rotation' => [
                'plaintext_once',
                'rotated_at',
                'expires_at',
                'client_id',
            ],
        ]);

    $data = $response->json('rotation');
    expect($data['client_id'])->toBe('fr009-confidential-test')
        ->and($data['plaintext_once'])->toBeString()
        ->and(strlen($data['plaintext_once']))->toBeGreaterThanOrEqual(32);

    // Verify DB was updated
    $this->confidentialClient->refresh();
    expect($this->confidentialClient->secret_rotated_at)->not->toBeNull()
        ->and($this->confidentialClient->secret_expires_at)->not->toBeNull();
});

it('rejects expired client secret at validation layer', function (): void {
    $this->confidentialClient->update([
        'secret_expires_at' => Carbon::now()->subDay(),
    ]);

    $registry = app(DownstreamClientRegistry::class);
    $registry->flush();

    $client = $registry->find('fr009-confidential-test');
    expect($client)->not->toBeNull();

    // Even with correct hash, expired secret should be rejected
    $valid = $registry->validSecret($client, 'old-secret-value-64chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect($valid)->toBeFalse();
});

it('accepts non-expired client secret at validation layer', function (): void {
    $this->confidentialClient->update([
        'secret_expires_at' => Carbon::now()->addDays(30),
    ]);

    $registry = app(DownstreamClientRegistry::class);
    $registry->flush();

    $client = $registry->find('fr009-confidential-test');
    expect($client)->not->toBeNull();

    $valid = $registry->validSecret($client, 'old-secret-value-64chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect($valid)->toBeTrue();
});

it('accepts secret when no expiry is configured', function (): void {
    $this->confidentialClient->update([
        'secret_expires_at' => null,
    ]);

    $registry = app(DownstreamClientRegistry::class);
    $registry->flush();

    $client = $registry->find('fr009-confidential-test');
    expect($client)->not->toBeNull();

    $valid = $registry->validSecret($client, 'old-secret-value-64chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect($valid)->toBeTrue();
});

function fr009AdminToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'fr009-admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
