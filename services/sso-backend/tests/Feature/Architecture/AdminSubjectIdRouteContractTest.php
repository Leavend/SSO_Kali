<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
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

it('registers admin user session routes with subjectId instead of subjectUuid', function (): void {
    $routes = collect(Route::getRoutes()->getRoutes())
        ->map(fn (Illuminate\Routing\Route $route): string => $route->uri())
        ->values()
        ->all();

    expect($routes)->toContain('admin/api/users/{subjectId}')
        ->and($routes)->toContain('admin/api/users/{subjectId}/sessions')
        ->and($routes)->not->toContain('admin/api/users/{subjectUuid}')
        ->and($routes)->not->toContain('admin/api/users/{subjectUuid}/sessions');
});

it('does not leak legacy subjectUuid naming in the admin route surface', function (): void {
    $surface = collect([
        base_path('routes/admin.php'),
        app_path('Http/Controllers/Admin/SessionController.php'),
        app_path('Http/Controllers/Admin/UserController.php'),
    ])->map(fn (string $path): string => File::get($path))
        ->implode("\n");

    expect($surface)->not->toContain('subjectUuid')
        ->and($surface)->not->toContain('{subjectUuid}');
});

it('accepts opaque subject ids on admin user session routes', function (string $subjectId): void {
    /** @var TestCase $this */
    Http::fake(['https://app-a.example/api/backchannel/logout' => Http::response([], 200)]);

    $admin = User::factory()->create([
        'subject_id' => 'admin-001',
        'subject_uuid' => 'admin-001',
        'role' => 'admin',
    ]);

    User::factory()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'role' => 'user',
        'email' => $subjectId.'@example.com',
    ]);

    DB::table('refresh_token_rotations')->insert([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => 'refresh-'.$subjectId,
        'token_family_id' => 'family-'.$subjectId,
        'secret_hash' => 'hash',
        'scope' => 'openid profile email',
        'session_id' => 'session-'.$subjectId,
        'upstream_refresh_token' => null,
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $token = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session',
        'subject_id' => $admin->subject_id,
    ])['access_token'];

    $this->withToken((string) $token)
        ->deleteJson('/admin/api/users/'.$subjectId.'/sessions')
        ->assertOk()
        ->assertJsonPath('subject_id', $subjectId)
        ->assertJsonPath('sessions_revoked', 1);
})->with([
    'numeric-string' => '366923007014207492',
    'opaque-string' => 'subject-alpha-001',
]);
