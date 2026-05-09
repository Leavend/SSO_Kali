<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
});

it('returns the authenticated admin principal from /admin/api/me', function (): void {
    /** @var TestCase $this */
    $authTime = now()->subMinutes(2)->timestamp;
    $admin = User::factory()->create([
        'subject_id' => 'admin-1',
        'subject_uuid' => 'admin-1',
        'role' => 'admin',
        'email' => 'admin@example.com',
        'display_name' => 'Admin User',
    ]);

    $response = $this->withToken(adminPanelAccessToken($admin, $authTime))
        ->getJson('/admin/api/me');

    $response
        ->assertOk()
        ->assertJsonPath('principal.subject_id', 'admin-1')
        ->assertJsonPath('principal.email', 'admin@example.com')
        ->assertJsonPath('principal.role', 'admin')
        ->assertJsonPath('principal.auth_context.auth_time', $authTime)
        ->assertJsonPath('principal.auth_context.amr.0', 'pwd')
        ->assertJsonPath('principal.auth_context.amr.1', 'mfa')
        ->assertJsonPath('principal.auth_context.acr', 'urn:example:loa:2')
        ->assertJsonPath('principal.auth_context.mfa_enforced', false)
        ->assertJsonPath('principal.auth_context.mfa_verified', true)
        ->assertJsonPath('principal.permissions.view_admin_panel', true)
        ->assertJsonPath('principal.permissions.manage_sessions', true)
        ->assertJsonPath('principal.permissions.menus.0.id', 'dashboard')
        ->assertJsonPath('principal.permissions.menus.0.visible', true)
        ->assertJsonPath('principal.permissions.menus.1.id', 'users')
        ->assertJsonPath('principal.permissions.menus.1.visible', true)
        ->assertJsonPath('principal.permissions.menus.4.id', 'external-idps')
        ->assertJsonPath('principal.permissions.menus.4.visible', true)
        ->assertJsonPath('principal.permissions.menus.5.id', 'sessions')
        ->assertJsonPath('principal.permissions.menus.5.visible', true)
        ->assertJsonMissingPath('principal.subject_uuid');

    $principal = $response->json('principal');

    expect($principal['permissions']['capabilities']['admin.panel.view'])->toBeTrue()
        ->and($principal['permissions']['capabilities']['admin.users.write'])->toBeTrue()
        ->and($principal['permissions']['capabilities']['admin.external-idps.read'])->toBeTrue()
        ->and($principal['permissions']['capabilities']['admin.external-idps.write'])->toBeTrue();

    /** @var object $event */
    $event = DB::table('admin_audit_events')->orderByDesc('id')->first();

    expect($event->taxonomy)->toBe('fresh_auth_success')
        ->and($event->action)->toBe('admin_api')
        ->and($event->outcome)->toBe('succeeded');
});

it('returns 401 from /admin/api/me when the bearer token is missing', function (): void {
    /** @var TestCase $this */
    $this->getJson('/admin/api/me')
        ->assertStatus(401)
        ->assertJsonPath('error', 'unauthorized');
});

it('returns 403 from /admin/api/me for non-admin authenticated users', function (): void {
    /** @var TestCase $this */
    $user = User::factory()->create([
        'subject_id' => 'user-1',
        'subject_uuid' => 'user-1',
        'role' => 'user',
    ]);

    $this->withToken(adminPanelAccessToken($user))
        ->getJson('/admin/api/me')
        ->assertStatus(403)
        ->assertJsonPath('error', 'forbidden')
        ->assertJsonPath('error_description', 'Admin role is required to access this resource.');

    /** @var object $event */
    $event = DB::table('admin_audit_events')->orderByDesc('id')->first();

    expect($event->taxonomy)->toBe('forbidden')
        ->and($event->action)->toBe('admin_api')
        ->and($event->outcome)->toBe('denied')
        ->and($event->reason)->toBe('admin_role_required');
});

function adminPanelAccessToken(User $user, ?int $authTime = null): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => $authTime ?? now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
