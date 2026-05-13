<?php

declare(strict_types=1);

use App\Models\Role;
use App\Models\SsoSession;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Regression guard for 2026-05-13 portal issues:
 *   1. Sessions count = 0 (service only queried refresh_token_rotations)
 *   2. Audit dates returned MySQL format → "Invalid Date" in JS
 *   3. Roles/permissions empty despite user having admin role
 */
beforeEach(function (): void {
    $this->seed(RbacSeeder::class);
});

it('includes sso_sessions in the sessions list for cookie-authenticated users', function (): void {
    [$user, $cookie] = portalSessionWithRole('sessions-list');

    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile/sessions');

    $response->assertOk()
        ->assertJsonStructure(['sessions'])
        ->assertJsonCount(1, 'sessions');

    $session = $response->json('sessions.0');
    expect($session)->toHaveKey('session_id')
        ->and($session)->toHaveKey('authenticated_at')
        ->and($session)->toHaveKey('ip_address');
});

it('returns audit event dates in ISO 8601 format', function (): void {
    [$user, $cookie] = portalSessionWithRole('audit-dates');

    // Insert a fake audit event
    DB::table('authentication_audit_events')->insert([
        'event_id' => (string) Str::ulid(),
        'subject_id' => $user->subject_id,
        'event_type' => 'login_succeeded',
        'outcome' => 'succeeded',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'occurred_at' => '2026-05-13 01:54:01',
        'client_id' => null,
        'session_id' => null,
    ]);

    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile/audit?limit=1');

    $response->assertOk();
    $occurredAt = $response->json('events.0.occurred_at');

    // Must be parseable by JavaScript's new Date() — ISO 8601 with T separator
    expect($occurredAt)->toContain('T')
        ->and($occurredAt)->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/');
});

it('includes roles and permissions in profile for session-authenticated users with admin role', function (): void {
    [$user, $cookie] = portalSessionWithRole('roles-perms', 'admin');

    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile');

    $response->assertOk();
    $auth = $response->json('authorization');

    expect($auth)->toHaveKey('roles')
        ->and($auth['roles'])->toContain('admin')
        ->and($auth)->toHaveKey('scope')
        ->and($auth['scope'])->toContain('roles');
});

/**
 * @return array{0: User, 1: string}
 */
function portalSessionWithRole(string $id, string $role = 'user'): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $id.'@portal.example.test',
        'password' => Hash::make('x'),
        'display_name' => 'Portal User',
        'given_name' => 'Portal',
        'role' => $role,
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    if ($role !== 'user') {
        $roleModel = Role::query()->where('slug', $role)->first();
        if ($roleModel) {
            $user->roles()->sync([$roleModel->id]);
        }
    }

    $sessionId = (string) Str::ulid();
    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addMinutes(60),
    ]);

    return [$user, $sessionId];
}
