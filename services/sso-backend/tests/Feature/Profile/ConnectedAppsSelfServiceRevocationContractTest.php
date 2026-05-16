<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.ttl.refresh_token_days', 30);
    config()->set('oidc_clients.clients.app-a.display_name', 'Application A');
    config()->set('oidc_clients.clients.app-b.display_name', 'Application B');
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'offline_access']);
    config()->set('oidc_clients.clients.app-b.allowed_scopes', ['openid', 'profile', 'email', 'offline_access']);

    Cache::flush();
});

it('lists connected apps without exposing token material', function (): void {
    $user = issue56User();
    issue56Tokens($user, 'app-a', 'issue56-session-a');
    issue56Tokens($user, 'app-b', 'issue56-session-b');

    $response = $this->getJson('/api/profile/connected-apps', issue56AuthHeaders($user, 'app-a', 'issue56-session-a'));

    $response->assertOk()
        ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private')
        ->assertHeader('Pragma', 'no-cache')
        ->assertJsonPath('connected_apps.0.client_id', 'app-a')
        ->assertJsonPath('connected_apps.0.display_name', 'Application A')
        ->assertJsonPath('connected_apps.1.client_id', 'app-b')
        ->assertJsonPath('connected_apps.1.display_name', 'Application B');

    foreach ($response->json('connected_apps') as $connectedApp) {
        expect($connectedApp)->not->toHaveKeys(['refresh_token', 'access_token', 'secret', 'upstream_refresh_token']);
    }
});

it('allows users to revoke one connected app without revoking other clients', function (): void {
    $user = issue56User();
    $appA = issue56Tokens($user, 'app-a', 'issue56-session-a');
    $appB = issue56Tokens($user, 'app-b', 'issue56-session-b');

    $response = $this
        ->withHeader('X-Request-Id', 'req-issue56-revoke')
        ->deleteJson('/api/profile/connected-apps/app-a', [], issue56AuthHeaders($user, 'app-a', 'issue56-session-a'));

    $response->assertOk()
        ->assertJsonPath('client_id', 'app-a')
        ->assertJsonPath('revoked', true)
        ->assertJsonPath('revoked_refresh_tokens', 2)
        ->assertHeader('Cache-Control', 'must-revalidate, no-cache, no-store, private');

    expect(app(RefreshTokenStore::class)->findActive($appA['refresh_token'], 'app-a'))->toBeNull()
        ->and(app(RefreshTokenStore::class)->findActive($appB['refresh_token'], 'app-b'))->not->toBeNull();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($appA['access_token']))
        ->toThrow(RuntimeException::class);

    $remaining = $this->getJson('/api/profile/connected-apps', issue56AuthHeaders($user, 'app-b', 'issue56-session-b'));
    $remaining->assertOk()
        ->assertJsonCount(1, 'connected_apps')
        ->assertJsonPath('connected_apps.0.client_id', 'app-b');

    $event = AdminAuditEvent::query()
        ->where('taxonomy', 'profile.connected_app_revoked')
        ->latest('id')
        ->firstOrFail();
    $context = $event->context;

    expect($event->action)->toBe('profile.connected_app.revoke')
        ->and($event->admin_subject_id)->toBe('issue56-subject')
        ->and($context['client_id'])->toBe('app-a')
        ->and($context['revoked_refresh_tokens'])->toBe(2)
        ->and($context['request_id'])->toBe('req-issue56-revoke')
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('rt_')
        ->and(json_encode($context, JSON_THROW_ON_ERROR))->not->toContain('Bearer');
});

it('lists public RP sessions even when no offline refresh token exists', function (): void {
    $user = issue56User();
    issue56Tokens($user, 'app-a', 'issue56-session-a');

    app(BackChannelSessionRegistry::class)->register('issue56-public-session', 'app-b', '', [
        'subject_id' => $user->subject_id,
        'frontchannel_logout_uri' => 'https://app-b.example/logout',
        'channels' => ['frontchannel'],
    ]);

    $response = $this->getJson('/api/profile/connected-apps', issue56AuthHeaders($user, 'app-a', 'issue56-session-a'));

    $response->assertOk();
    $clientIds = collect($response->json('connected_apps'))->pluck('client_id')->all();

    expect($clientIds)->toContain('app-b')
        ->and(collect($response->json('connected_apps'))->firstWhere('client_id', 'app-b')['active_rp_sessions'])->toBe(1);
});

it('rejects missing or invalid connected app bearer tokens', function (): void {
    $this->getJson('/api/profile/connected-apps')->assertStatus(401)->assertJsonPath('error', 'invalid_token');
    $this->deleteJson('/api/profile/connected-apps/app-a')->assertStatus(401)->assertJsonPath('error', 'invalid_token');
});

it('keeps connected app revocation exempt from web csrf before bearer authentication', function (): void {
    $bootstrap = file_get_contents(base_path('bootstrap/app.php'));

    expect($bootstrap)->toContain("'api/profile/connected-apps/*'");
});

function issue56User(): User
{
    return User::factory()->create([
        'subject_id' => 'issue56-subject',
        'email' => 'issue56@example.test',
        'email_verified_at' => now(),
        'display_name' => 'Issue 56 User',
        'status' => 'active',
    ]);
}

/**
 * @return array<string, mixed>
 */
function issue56Tokens(User $user, string $clientId, string $sessionId): array
{
    return app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => $clientId,
        'scope' => 'openid profile email offline_access',
        'session_id' => $sessionId,
        'auth_time' => time(),
        'amr' => ['pwd'],
        'upstream_refresh_token' => 'upstream-'.$clientId,
    ]);
}

/**
 * @return array<string, string>
 */
function issue56AuthHeaders(User $user, string $clientId, string $sessionId): array
{
    $tokens = issue56Tokens($user, $clientId, $sessionId);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
