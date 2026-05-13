<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Regression guard for the 2026-05-13 portal incident where
 * /api/profile, /api/profile/sessions, /api/profile/connected-apps,
 * and /api/profile/audit returned 401 / 404 to the first-party
 * portal even when the user was logged in via session cookie.
 *
 * Root cause: the profile endpoints required a Bearer access token
 * (AccessTokenGuard), but the portal is a cookie-based first-party
 * client and never presents a bearer. The /api/profile/audit route
 * was also not registered despite its controller being present.
 *
 * Contract: the portal must be reachable via either a valid bearer
 * token OR a valid SSO session cookie, producing the same JSON
 * shape when the session's default scopes cover the requested fields.
 */
beforeEach(function (): void {
    $this->seed(RbacSeeder::class);
});

it('returns 200 for /api/profile using a session cookie', function (): void {
    [$user, $cookie] = portalSessionFor(__FUNCTION__.'-profile');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile')
        ->assertOk()
        ->assertJsonPath('profile.subject_id', $user->subject_id)
        ->assertJsonPath('profile.email', $user->email);
});

it('returns 200 for /api/profile/sessions using a session cookie', function (): void {
    [, $cookie] = portalSessionFor(__FUNCTION__.'-sessions');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile/sessions')
        ->assertOk()
        ->assertJsonStructure(['sessions']);
});

it('returns 200 for /api/profile/connected-apps using a session cookie', function (): void {
    [, $cookie] = portalSessionFor(__FUNCTION__.'-apps');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile/connected-apps')
        ->assertOk()
        ->assertJsonStructure(['connected_apps']);
});

it('returns 200 for /api/profile/audit using a session cookie', function (): void {
    [, $cookie] = portalSessionFor(__FUNCTION__.'-audit');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$cookie)
        ->getJson('/api/profile/audit?limit=5')
        ->assertOk()
        ->assertJsonStructure(['events', 'total']);
});

it('returns 401 for /api/profile without a cookie or bearer', function (): void {
    $this->getJson('/api/profile')->assertStatus(401);
    $this->getJson('/api/profile/sessions')->assertStatus(401);
    $this->getJson('/api/profile/connected-apps')->assertStatus(401);
    $this->getJson('/api/profile/audit')->assertStatus(401);
});

/**
 * Provisions a fresh User + SsoSession and returns [user, rawSessionId].
 * The raw session_id is what the cookie carries and what
 * SsoSessionCookieResolver decodes back into a session.
 */
function portalSessionFor(string $identifier): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $identifier.'@portal.example.test',
        'password' => Hash::make('irrelevant'),
        'display_name' => 'Portal User',
        'given_name' => 'Portal',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    $sessionId = (string) Str::uuid();

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
