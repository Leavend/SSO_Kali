<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);

    // Reseed: the global Pest.php beforeEach wipes migrated registrations.
    // This test validates that every client the Admin Client index resolves
    // also resolves via show() — so we re-seed what the migration would produce.
    OidcClientRegistration::insert(parityClientRows());
});

it('ensures every client returned by index() returns 200 from show() — list↔detail parity', function (): void {
    $admin = User::factory()->create([
        'subject_id' => 'admin-parity',
        'subject_uuid' => 'admin-parity',
        'role' => 'admin',
        'email' => 'admin-parity@example.com',
        'display_name' => 'Parity Admin',
    ]);

    // Fetch the client list.
    $list = $this->withToken(adminParityAccessToken($admin))
        ->getJson('/admin/api/clients');

    $list->assertOk();

    $clientIds = collect($list->json('clients'))
        ->pluck('client_id')
        ->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
        ->all();

    expect($clientIds)->not->toBeEmpty('Client index must return at least one client.');

    foreach ($clientIds as $clientId) {
        $detail = $this->withToken(adminParityAccessToken($admin))
            ->getJson("/admin/api/clients/{$clientId}");

        $detail->assertOk("GET /admin/api/clients/{$clientId} must return 200 when index() includes it.");
    }
});

function adminParityAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-parity-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

/**
 * Produce the same rows the backfill migration would create so the parity
 * test sees seeded clients even after the global Pest.php wipe.
 *
 * @return list<array<string, mixed>>
 */
function parityClientRows(): array
{
    $now = now();
    $rows = [];

    foreach (config('oidc_clients.clients', []) as $clientId => $config) {
        if (! is_string($clientId) || ! is_array($config)) {
            continue;
        }

        $rows[] = [
            'client_id' => $clientId,
            'display_name' => match ($clientId) {
                'sso-frontend-portal' => 'SSO Frontend Portal',
                'sso-admin-panel' => 'SSO Admin Panel',
                'app-a' => 'App A — Public Client',
                'app-b' => 'App B — Confidential Client',
                default => $clientId,
            },
            'type' => (string) ($config['type'] ?? 'public'),
            'environment' => 'production',
            'app_base_url' => '',
            'redirect_uris' => json_encode(array_values($config['redirect_uris'] ?? [])),
            'post_logout_redirect_uris' => json_encode(array_values($config['post_logout_redirect_uris'] ?? [])),
            'backchannel_logout_uri' => $config['backchannel_logout_uri'] ?? null,
            'secret_hash' => ($config['type'] ?? 'public') === 'confidential'
                && is_string($config['secret'] ?? null)
                ? $config['secret']
                : null,
            'owner_email' => 'parity-test@example.com',
            'provisioning' => 'seeded',
            'contract' => json_encode([
                'source' => 'config/seeder',
                'backfilled_at' => $now->toIso8601String(),
            ]),
            'status' => 'active',
            'activated_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    return $rows;
}
