<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    $this->seed(RbacSeeder::class);
});

it('exposes default sso error templates to authorized admins', function (): void {
    $admin = ssoErrorTemplateAdmin([AdminPermission::SSO_ERROR_TEMPLATES_READ]);

    $response = $this->getJson('/admin/api/sso-error-templates', ssoErrorTemplateHeaders($admin));

    $response->assertOk()
        ->assertJsonPath('templates.0.error_code', 'invalid_request')
        ->assertJsonPath('templates.0.locale', 'id')
        ->assertJsonStructure([
            'templates' => [[
                'error_code',
                'locale',
                'title',
                'message',
                'action_label',
                'retry_allowed',
                'alternative_login_allowed',
                'is_enabled',
            ]],
        ]);
});

it('allows authorized admins to update and reset an sso error template', function (): void {
    $admin = ssoErrorTemplateAdmin([
        AdminPermission::SSO_ERROR_TEMPLATES_READ,
        AdminPermission::SSO_ERROR_TEMPLATES_WRITE,
    ]);

    $payload = [
        'locale' => 'id',
        'title' => 'Login Bermasalah',
        'message' => 'Silakan coba login ulang dari portal SSO.',
        'action_label' => 'Login ulang',
        'action_url' => 'https://sso.timeh.my.id/login',
        'retry_allowed' => true,
        'alternative_login_allowed' => false,
        'is_enabled' => true,
    ];

    $this->patchJson('/admin/api/sso-error-templates/invalid_grant', $payload, ssoErrorTemplateHeaders($admin))
        ->assertOk()
        ->assertJsonPath('template.title', 'Login Bermasalah');

    $this->getJson('/admin/api/sso-error-templates/invalid_grant?locale=id', ssoErrorTemplateHeaders($admin))
        ->assertOk()
        ->assertJsonPath('template.message', 'Silakan coba login ulang dari portal SSO.');

    $this->postJson('/admin/api/sso-error-templates/invalid_grant/reset', ['locale' => 'id'], ssoErrorTemplateHeaders($admin))
        ->assertOk()
        ->assertJsonPath('template.is_enabled', false);
});

it('rejects unsafe action urls in sso error templates', function (): void {
    $admin = ssoErrorTemplateAdmin([
        AdminPermission::SSO_ERROR_TEMPLATES_READ,
        AdminPermission::SSO_ERROR_TEMPLATES_WRITE,
    ]);

    $this->patchJson('/admin/api/sso-error-templates/invalid_request', [
        'locale' => 'id',
        'title' => 'X',
        'message' => 'Y',
        'action_label' => 'Z',
        'action_url' => 'javascript:alert(1)',
        'retry_allowed' => false,
        'alternative_login_allowed' => false,
        'is_enabled' => true,
    ], ssoErrorTemplateHeaders($admin))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['action_url']);
});

function ssoErrorTemplateAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'sso-error-template-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'sso-error-template-role-'.uniqid(), 'name' => 'SSO Error Template Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/**
 * @return array<string, string>
 */
function ssoErrorTemplateHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'sso-error-template-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
