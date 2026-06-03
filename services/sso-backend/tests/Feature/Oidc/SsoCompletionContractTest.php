<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\SsoSessionCookiePolicy;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Str;

beforeEach(function (): void {
    $this->seed(RbacSeeder::class);

    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.admin.panel_client_id', 'sso-admin-panel');
    config()->set('sso.admin.freshness.read_seconds', 28800);
    config()->set('oidc_clients.clients', [
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://admin-sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://admin-sso.timeh.my.id/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access', 'roles', 'permissions'],
            'skip_consent' => true,
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();
});

it('completes a pending admin authorization request with an active portal sso session', function (): void {
    [$user, $sessionId] = ssoCompletionUser('sso-complete-admin@example.test', 'admin');
    $authRequestId = ssoCompletionPendingRequest();

    $response = $this->withHeader('Cookie', ssoCompletionCookieName().'='.$sessionId)
        ->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId]);

    $response->assertOk();

    $redirectUri = (string) $response->json('redirect_uri');

    expect($redirectUri)->toStartWith('https://admin-sso.timeh.my.id/auth/callback?code=')
        ->and($redirectUri)->toContain('state=state-sso-complete')
        ->and($redirectUri)->toContain('iss=https%3A%2F%2Fapi-sso.timeh.my.id');
});

it('rejects sso completion without a valid portal sso session cookie', function (): void {
    $authRequestId = ssoCompletionPendingRequest();

    $this->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId])
        ->assertUnauthorized()
        ->assertJsonPath('error', 'invalid_request');
});

it('keeps sso completion exempt from web csrf before cookie authentication', function (): void {
    $this->withMiddleware()
        ->postJson('/connect/sso-complete', ['auth_request_id' => 'csrf-smoke'])
        ->assertUnauthorized()
        ->assertJsonPath('error', 'invalid_request');
});

it('rejects sso completion for non admin users', function (): void {
    [, $sessionId] = ssoCompletionUser('sso-complete-user@example.test', 'user');
    $authRequestId = ssoCompletionPendingRequest();

    $this->withHeader('Cookie', ssoCompletionCookieName().'='.$sessionId)
        ->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId])
        ->assertForbidden()
        ->assertJsonPath('error', 'access_denied');
});

it('rejects sso completion when a legacy admin column has no admin role pivot', function (): void {
    [, $sessionId] = ssoCompletionUser('sso-complete-column-admin@example.test', 'admin', syncPivot: false);
    $authRequestId = ssoCompletionPendingRequest();

    $this->withHeader('Cookie', ssoCompletionCookieName().'='.$sessionId)
        ->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId])
        ->assertForbidden()
        ->assertJsonPath('error', 'access_denied');
});

it('rejects sso completion when the portal session subject is no longer allowed', function (): void {
    [$user, $sessionId] = ssoCompletionUser('sso-complete-disabled@example.test', 'admin');
    $user->forceFill(['disabled_at' => now(), 'disabled_reason' => 'test'])->save();
    $authRequestId = ssoCompletionPendingRequest();

    $this->withHeader('Cookie', ssoCompletionCookieName().'='.$sessionId)
        ->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId])
        ->assertForbidden()
        ->assertJsonPath('error', 'access_denied');
});

it('requires fresh authentication before completing stale admin sessions', function (): void {
    [, $sessionId] = ssoCompletionUser('sso-complete-stale@example.test', 'admin', authenticatedAt: now()->subHours(9));
    $authRequestId = ssoCompletionPendingRequest();

    $this->withHeader('Cookie', ssoCompletionCookieName().'='.$sessionId)
        ->postJson('/connect/sso-complete', ['auth_request_id' => $authRequestId])
        ->assertStatus(409)
        ->assertJsonPath('error', 'interaction_required');
});

/** @return array{0: User, 1: string} */
function ssoCompletionUser(string $email, string $role, mixed $authenticatedAt = null, bool $syncPivot = true): array
{
    $user = User::factory()->create(['email' => $email, 'role' => $role]);

    if ($syncPivot) {
        $roleModel = Role::query()->where('slug', $role)->firstOrFail();
        $user->roles()->sync([$roleModel->id]);
    }

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'SsoCompletionContract/1.0',
        'authenticated_at' => $authenticatedAt ?? now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function ssoCompletionPendingRequest(): string
{
    $state = app(AuthRequestStore::class)->put([
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'https://admin-sso.timeh.my.id/auth/callback',
        'scope' => 'openid profile email offline_access roles permissions',
        'nonce' => 'nonce-sso-complete',
        'original_state' => 'state-sso-complete',
        'downstream_code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'session_id' => (string) Str::uuid(),
        'ip_address' => '127.0.0.1',
        'user_agent' => 'SsoCompletionContract/1.0',
        'max_age' => '28800',
    ]);

    expect($state)->toBeString()->not->toBe('');

    return (string) $state;
}

function ssoCompletionCookieName(): string
{
    return SsoSessionCookiePolicy::configuredName(config('sso.session.cookie'));
}
