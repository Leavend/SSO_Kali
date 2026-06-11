<?php

declare(strict_types=1);

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
