<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    $this->seed(RbacSeeder::class);
});

it('rejects missing or invalid profile portal tokens', function (): void {
    $this->getJson('/api/profile')->assertStatus(401)->assertJsonPath('error', 'invalid_token');
    // Anonymous PATCH: authentication required comes first (401),
    // not scope-check (403). Scope-check still fires for authenticated
    // bearer tokens without the profile scope — covered separately.
    $this->patchJson('/api/profile', ['display_name' => 'Blocked'])->assertStatus(401);
});

it('returns the stable no-store profile portal contract with scoped claims only', function (): void {
    $user = profilePortalUser();
    DB::table('login_contexts')->insert([
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'device_fingerprint' => 'device-1',
        'risk_score' => 7,
        'mfa_required' => true,
        'last_seen_at' => now()->toIso8601String(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $response = $this->getJson('/api/profile', profilePortalAuthHeaders($user, 'openid profile email'));

    $response->assertOk()
        ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private')
        ->assertHeader('Pragma', 'no-cache')
        ->assertJsonPath('profile.subject_id', 'profile-portal-subject')
        ->assertJsonPath('profile.display_name', 'Profile Portal User')
        ->assertJsonPath('profile.email', 'portal@example.test')
        ->assertJsonPath('security.risk_score', 7)
        ->assertJsonPath('security.mfa_required', true)
        ->assertJsonMissingPath('authorization.roles')
        ->assertJsonMissingPath('authorization.permissions')
        ->assertJsonMissingPath('profile.password')
        ->assertJsonMissingPath('profile.subject_uuid');
});

it('gates email profile roles and permissions by granted token scopes', function (): void {
    $user = profilePortalUser();
    $role = Role::query()->where('slug', 'admin')->firstOrFail();
    $permission = Permission::query()->where('slug', AdminPermission::USERS_READ)->firstOrFail();
    $role->permissions()->syncWithoutDetaching([$permission->id]);
    $user->roles()->sync([$role->id]);

    $profileOnly = $this->getJson('/api/profile', profilePortalAuthHeaders($user, 'openid profile'));
    $profileOnly->assertOk()
        ->assertJsonPath('profile.display_name', 'Profile Portal User')
        ->assertJsonMissingPath('profile.email')
        ->assertJsonMissingPath('authorization.roles');

    $rbac = $this->getJson('/api/profile', profilePortalAuthHeaders($user, 'openid profile email roles permissions'));
    $rbac->assertOk()
        ->assertJsonPath('profile.email', 'portal@example.test')
        ->assertJsonPath('authorization.roles.0', 'admin');

    expect($rbac->json('authorization.permissions'))->toContain(AdminPermission::USERS_READ);
});

it('updates only allowed self profile fields and audits changed field names', function (): void {
    $user = profilePortalUser();

    $this->patchJson('/api/profile', [
        'display_name' => 'Updated Portal User',
        'given_name' => 'Updated',
        'email' => 'attacker@example.test',
    ], profilePortalAuthHeaders($user, 'openid profile email'))->assertStatus(422);

    $response = $this->patchJson('/api/profile', [
        'display_name' => 'Updated Portal User',
        'given_name' => 'Updated',
    ], profilePortalAuthHeaders($user, 'openid profile email'));

    $response->assertOk()
        ->assertJsonPath('profile.display_name', 'Updated Portal User')
        ->assertJsonPath('profile.email', 'portal@example.test')
        ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private');

    $user->refresh();
    $audit = DB::table('admin_audit_events')->latest('id')->first();
    $context = json_decode((string) $audit->context, true, 512, JSON_THROW_ON_ERROR);

    expect($user->email)->toBe('portal@example.test')
        ->and($context['changed_fields'])->toBe(['display_name', 'given_name'])
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('attacker@example.test')
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('Bearer');
});

it('uses a dedicated profile api throttle bucket for burst isolation', function (): void {
    $routes = collect(app('router')->getRoutes())->mapWithKeys(fn ($route): array => [
        implode('|', $route->methods()).' '.$route->uri() => $route->gatherMiddleware(),
    ]);

    foreach ([
        'GET|HEAD api/profile',
        'PATCH api/profile',
        'GET|HEAD api/profile/connected-apps',
        'DELETE api/profile/connected-apps/{clientId}',
    ] as $route) {
        expect($routes[$route] ?? [])->toContain('throttle:profile-api');
    }
});

function profilePortalUser(): User
{
    return User::factory()->create([
        'subject_id' => 'profile-portal-subject',
        'subject_uuid' => 'hidden-subject-uuid',
        'email' => 'portal@example.test',
        'email_verified_at' => now(),
        'display_name' => 'Profile Portal User',
        'given_name' => 'Profile',
        'family_name' => 'User',
        'status' => 'active',
    ]);
}

/**
 * @return array<string, string>
 */
function profilePortalAuthHeaders(User $user, string $scope): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => $scope,
        'session_id' => 'profile-portal-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
