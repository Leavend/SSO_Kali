<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    Cache::flush();

    config()->set('sso.issuer', 'https://sso.test');
    config()->set('sso.base_url', 'https://sso.test');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.signing.alg', 'ES256');
    config()->set('sso.jwt.local_allowed_algs', ['ES256']);
    config()->set('sso.default_scopes', ['openid', 'profile', 'email']);
    config()->set('sso.public_metadata.cache_ttl_seconds', 300);
    config()->set('sso.admin.mfa.enforced', false);

    $this->seed(RbacSeeder::class);
});

it('returns safe OIDC foundation evidence for authorized admins', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);

    $response = $this->getJson('/admin/api/oidc-foundation', oidcFoundationAdminHeaders(
        $admin,
        [AdminPermission::DASHBOARD_VIEW],
    ));

    $response->assertOk();

    expect($response->headers->get('Cache-Control'))->toContain('no-store');

    $response
        ->assertJsonPath('discovery.issuer', 'https://sso.test')
        ->assertJsonPath('discovery.authorization_endpoint', 'https://sso.test/authorize')
        ->assertJsonPath('discovery.token_endpoint', 'https://sso.test/token')
        ->assertJsonPath('discovery.jwks_uri', 'https://sso.test/.well-known/jwks.json')
        ->assertJsonPath('discovery.userinfo_endpoint', 'https://sso.test/userinfo')
        ->assertJsonPath('catalog.scopes.0.name', 'openid')
        ->assertJsonPath('catalog.scopes.0.label_status', 'mapped')
        ->assertJsonPath('issuer_consistency.status', 'pass')
        ->assertJsonPath('endpoint_consistency.0.name', 'authorization_endpoint')
        ->assertJsonPath('availability.discovery.status', 'unknown')
        ->assertJsonPath('availability.jwks.status', 'unknown')
        ->assertJsonPath('evidence.jwks_rotation.status', 'missing')
        ->assertJsonMissingPath('private_key')
        ->assertJsonMissingPath('client_secret')
        ->assertJsonMissingPath('signing_secret')
        ->assertJsonMissingPath('metrics_token');

    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))
        ->not->toContain('private_key')
        ->not->toContain('client_secret')
        ->not->toContain('signing_secret')
        ->not->toContain('metrics_token');
});

it('compares discovery issuer against the configured issuer separately from the public base URL', function (): void {
    config()->set('sso.issuer', 'https://issuer.test/');
    config()->set('sso.base_url', 'https://public.test/');

    $admin = User::factory()->create(['role' => 'admin']);

    $this->getJson('/admin/api/oidc-foundation', oidcFoundationAdminHeaders(
        $admin,
        [AdminPermission::DASHBOARD_VIEW],
    ))
        ->assertOk()
        ->assertJsonPath('discovery.issuer', 'https://issuer.test')
        ->assertJsonPath('discovery.authorization_endpoint', 'https://public.test/authorize')
        ->assertJsonPath('issuer_consistency.status', 'pass')
        ->assertJsonPath('issuer_consistency.configured_issuer', 'https://issuer.test')
        ->assertJsonPath('issuer_consistency.discovery_issuer', 'https://issuer.test')
        ->assertJsonPath('issuer_consistency.public_base_url', 'https://public.test');
});

it('requires the dashboard view permission', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->getJson('/admin/api/oidc-foundation', oidcFoundationAdminHeaders($admin, [AdminPermission::PANEL_VIEW]))
        ->assertForbidden();
});

/**
 * @param  list<string>  $permissions
 * @return array<string, string>
 */
function oidcFoundationAdminHeaders(User $admin, array $permissions): array
{
    oidcFoundationSyncAdminPermissions($admin, $permissions);

    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $admin->subject_id,
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'oidc-foundation-session-'.$admin->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}

/**
 * @param  list<string>  $permissions
 */
function oidcFoundationSyncAdminPermissions(User $admin, array $permissions): void
{
    $role = Role::query()->create([
        'slug' => 'oidc-foundation-role-'.substr(md5($admin->subject_id.json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 12),
        'name' => 'OIDC Foundation Contract Role',
    ]);

    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $admin->roles()->sync([$role->id]);
}
