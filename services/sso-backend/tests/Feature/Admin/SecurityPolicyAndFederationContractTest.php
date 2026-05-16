<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\ExternalIdentityProvider;
use App\Models\Role;
use App\Models\SecurityPolicy;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Services\Security\SecurityPolicyService;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.frontend_url', 'http://localhost:3000');
    config()->set('sso.login_url', 'http://localhost:3000/login');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('sso.external_idp.callback_url', 'https://sso.example.test/external-idp/callback');
    config()->set('sso.external_idp.public_start_route_enabled', true);
    config()->set('sso.external_idp.missing_email_strategy', 'reject');

    $this->seed(RbacSeeder::class);
});

it('proposes activates and rolls back a security policy with audit and runtime cache', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_security_policy', 'role' => 'admin']);
    Cache::flush();

    $token = governanceAdminToken($admin);

    $proposeV1 = $this->withToken($token)
        ->postJson('/admin/api/security-policies/password', [
            'payload' => ['min_length' => 14, 'require_special' => true],
            'reason' => 'Phase 1 hardening proposal.',
        ]);
    $proposeV1->assertStatus(201)
        ->assertJsonPath('policy.version', 1)
        ->assertJsonPath('policy.status', SecurityPolicy::STATUS_DRAFT);

    $activateV1 = $this->withToken($token)
        ->postJson('/admin/api/security-policies/password/1/activate', [
            'reason' => 'Roll out hardening.',
        ]);
    $activateV1->assertOk()
        ->assertJsonPath('policy.status', SecurityPolicy::STATUS_ACTIVE);

    expect(app(SecurityPolicyService::class)->active('password', ['min_length' => 8]))
        ->toMatchArray(['min_length' => 14, 'require_special' => true]);

    $proposeV2 = $this->withToken($token)
        ->postJson('/admin/api/security-policies/password', [
            'payload' => ['min_length' => 16, 'require_special' => true],
            'reason' => 'Phase 2 hardening proposal.',
        ]);
    $proposeV2->assertStatus(201)->assertJsonPath('policy.version', 2);

    $this->withToken($token)
        ->postJson('/admin/api/security-policies/password/2/activate', ['reason' => 'Adopt v2.'])
        ->assertOk()
        ->assertJsonPath('policy.status', SecurityPolicy::STATUS_ACTIVE);

    expect(SecurityPolicy::query()
        ->where('category', 'password')
        ->where('version', 1)
        ->value('status'))->toBe(SecurityPolicy::STATUS_SUPERSEDED);

    $rollback = $this->withToken($token)
        ->postJson('/admin/api/security-policies/password/1/rollback', ['reason' => 'Regression detected in v2.']);
    $rollback->assertOk()->assertJsonPath('policy.version', 1);

    expect(SecurityPolicy::query()->where('category', 'password')->where('status', SecurityPolicy::STATUS_ACTIVE)->value('version'))->toBe(1);

    foreach (['propose_security_policy', 'activate_security_policy', 'rollback_security_policy'] as $action) {
        expect(AdminAuditEvent::query()->where('action', $action)->exists())->toBeTrue();
    }
});

it('rejects security policy mutations from roles missing the security-policy permissions', function (): void {
    $auditor = User::factory()->create(['subject_id' => 'admin_security_auditor', 'role' => 'admin']);
    $auditor->roles()->sync([Role::query()->where('slug', 'auditor')->value('id')]);

    $response = $this->withToken(governanceAdminToken($auditor))
        ->postJson('/admin/api/security-policies/password', [
            'payload' => ['min_length' => 14],
        ]);

    $response->assertStatus(403);
});

it('previews external idp claim mapping including missing-email warnings', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_idp_preview', 'role' => 'admin']);
    $provider = makeExternalIdentityProvider();

    $response = $this->withToken(governanceAdminToken($admin))
        ->postJson('/admin/api/external-idps/'.$provider->provider_key.'/mapping-preview', [
            'claims' => [
                'sub' => 'idp-user-1',
                'email' => 'user@example.test',
                'email_verified' => true,
                'name' => 'Sample User',
            ],
        ]);

    $response->assertOk()
        ->assertJsonPath('preview.mapped.subject', 'idp-user-1')
        ->assertJsonPath('preview.mapped.email', 'user@example.test')
        ->assertJsonPath('preview.safe_to_link', true)
        ->assertJsonPath('preview.missing_email_strategy', 'reject')
        ->assertJsonPath('preview.errors', []);
});

it('warns when previewed claims lack an email under reject strategy', function (): void {
    $admin = User::factory()->create(['subject_id' => 'admin_idp_no_email', 'role' => 'admin']);
    $provider = makeExternalIdentityProvider();

    $response = $this->withToken(governanceAdminToken($admin))
        ->postJson('/admin/api/external-idps/'.$provider->provider_key.'/mapping-preview', [
            'claims' => [
                'sub' => 'idp-user-2',
                'name' => 'No Email User',
            ],
        ]);

    $response->assertOk()
        ->assertJsonPath('preview.mapped.email', null)
        ->assertJsonPath('preview.safe_to_link', false);
    expect($response->json('preview.warnings'))->toContain('Email is missing; federation will be rejected by current strategy.');
});

it('returns safe_to_link true when the missing-email strategy allows subject-only linking', function (): void {
    config()->set('sso.external_idp.missing_email_strategy', 'subject_only');

    $admin = User::factory()->create(['subject_id' => 'admin_idp_subject_only', 'role' => 'admin']);
    $provider = makeExternalIdentityProvider();

    $response = $this->withToken(governanceAdminToken($admin))
        ->postJson('/admin/api/external-idps/'.$provider->provider_key.'/mapping-preview', [
            'claims' => [
                'sub' => 'idp-user-3',
                'name' => 'No Email User',
            ],
        ]);

    $response->assertOk()
        ->assertJsonPath('preview.mapped.email', null)
        ->assertJsonPath('preview.safe_to_link', true)
        ->assertJsonPath('preview.missing_email_strategy', 'subject_only');
});

it('falls back to the SSO login page when public federation start is disabled', function (): void {
    config()->set('sso.external_idp.public_start_route_enabled', false);

    makeExternalIdentityProvider();

    $response = $this->get('/external-idp/start/sample-idp');

    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('error=external_idp_disabled');
});

it('falls back to the SSO login page when the requested provider is unavailable', function (): void {
    $response = $this->get('/external-idp/start/missing-provider');

    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('error=external_idp_unavailable');
});

function governanceAdminToken(User $admin): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'sec-policy-session-'.$admin->subject_id,
        'subject_id' => $admin->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

function makeExternalIdentityProvider(): ExternalIdentityProvider
{
    return ExternalIdentityProvider::query()->create([
        'provider_key' => 'sample-idp',
        'display_name' => 'Sample IdP',
        'issuer' => 'https://idp.example.test',
        'metadata_url' => 'https://idp.example.test/.well-known/openid-configuration',
        'client_id' => 'sample-client',
        'client_secret_encrypted' => Crypt::encryptString('client-secret'),
        'authorization_endpoint' => 'https://idp.example.test/authorize',
        'token_endpoint' => 'https://idp.example.test/token',
        'userinfo_endpoint' => 'https://idp.example.test/userinfo',
        'jwks_uri' => 'https://idp.example.test/jwks',
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'profile', 'email'],
        'priority' => 10,
        'enabled' => true,
        'is_backup' => false,
        'tls_validation_enabled' => true,
        'signature_validation_enabled' => true,
        'health_status' => 'healthy',
    ]);
}
