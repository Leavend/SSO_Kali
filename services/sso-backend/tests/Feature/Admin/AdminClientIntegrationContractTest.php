<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://dev-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients', []);
});

it('returns a broker validated client integration contract for admins', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-contract-1',
        'subject_uuid' => 'admin-contract-1',
        'role' => 'admin',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/contract', [
            'appName' => 'Customer Portal',
            'clientId' => 'customer-portal',
            'environment' => 'development',
            'clientType' => 'public',
            'appBaseUrl' => 'https://customer-dev.timeh.my.id',
            'callbackPath' => '/auth/callback',
            'logoutPath' => '/auth/backchannel/logout',
            'ownerEmail' => 'owner@company.com',
            'provisioning' => 'jit',
        ])
        ->assertOk()
        ->assertJsonPath('contract.clientId', 'customer-portal')
        ->assertJsonPath('contract.redirectUri', 'https://customer-dev.timeh.my.id/auth/callback')
        ->assertJsonPath('contract.env.1', 'SSO_CLIENT_ID=customer-portal');
});

it('returns validation violations without mutating broker clients', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-contract-2',
        'subject_uuid' => 'admin-contract-2',
        'role' => 'admin',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/contract', [
            'appName' => 'Unsafe App',
            'clientId' => 'unsafe-app',
            'environment' => 'live',
            'clientType' => 'public',
            'appBaseUrl' => 'http://unsafe.timeh.my.id',
            'callbackPath' => '/auth/*',
            'logoutPath' => '/auth/backchannel/logout',
            'ownerEmail' => 'owner@company.com',
            'provisioning' => 'jit',
        ])
        ->assertStatus(422)
        ->assertJsonPath('error', 'client_integration_invalid')
        ->assertJsonPath('violations.0', 'Live client wajib memakai HTTPS.')
        ->assertJsonPath('violations.1', 'Callback path tidak boleh wildcard.');
});

function clientContractAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-contract-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
