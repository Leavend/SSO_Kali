<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Profile\ConnectedAppsService;
use Illuminate\Support\Facades\Cache;

/**
 * BE-FR026-001 — Connected apps listing pagination + revocation contract.
 *
 * FR/UC: FR-026 / UC-12, UC-13, UC-21, UC-39.
 *
 * Acceptance criteria locked here:
 *   1. /api/profile/connected-apps response is paginated (page, per_page,
 *      total, has_more) and bounded by ConnectedAppsService::MAX_PER_PAGE.
 *   2. Revoking a connected app invalidates its refresh + access tokens
 *      AND clears the user-consent record so the next /authorize forces
 *      a fresh consent decision.
 *   3. /userinfo with a revoked-app access token is rejected.
 */
beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.ttl.refresh_token_days', 30);

    Cache::flush();
});

it('paginates the connected apps listing with bounded page size', function (): void {
    $user = fr026User('fr026-pagination');

    // Seed 5 distinct connected apps.
    foreach (range(1, 5) as $i) {
        config()->set("oidc_clients.clients.fr026-c{$i}.display_name", "Client {$i}");
        config()->set("oidc_clients.clients.fr026-c{$i}.allowed_scopes", ['openid', 'offline_access']);
        app(DownstreamClientRegistry::class)->flush();
        fr026MintTokens($user, "fr026-c{$i}", "fr026-session-{$i}");
    }

    $headers = fr026AuthHeaders($user, 'fr026-c1', 'fr026-session-1');

    $page1 = $this->getJson('/api/profile/connected-apps?page=1&per_page=2', $headers)->assertOk();

    expect($page1->json('pagination.total'))->toBe(5)
        ->and($page1->json('pagination.page'))->toBe(1)
        ->and($page1->json('pagination.per_page'))->toBe(2)
        ->and($page1->json('pagination.has_more'))->toBeTrue()
        ->and(count($page1->json('connected_apps')))->toBe(2);

    $page3 = $this->getJson('/api/profile/connected-apps?page=3&per_page=2', $headers)->assertOk();
    expect($page3->json('pagination.has_more'))->toBeFalse()
        ->and(count($page3->json('connected_apps')))->toBe(1);

    // Hard upper bound: per_page>MAX clamps; result still bounded.
    $clamped = $this->getJson('/api/profile/connected-apps?per_page=999', $headers)->assertOk();
    expect((int) $clamped->json('pagination.per_page'))
        ->toBeLessThanOrEqual(ConnectedAppsService::MAX_PER_PAGE);
});

it('revoking a connected app revokes tokens and clears consent so next consent is required', function (): void {
    config()->set('oidc_clients.clients.fr026-revoke.display_name', 'FR026 Revoke');
    config()->set('oidc_clients.clients.fr026-revoke.allowed_scopes', ['openid', 'profile', 'email', 'offline_access']);

    $user = fr026User('fr026-revoke-subject');
    $tokens = fr026MintTokens($user, 'fr026-revoke', 'fr026-revoke-session');

    // Pre-grant consent so we can confirm revoke clears it.
    app(ConsentService::class)->grant(
        $user->subject_id,
        'fr026-revoke',
        ['openid', 'profile', 'email'],
    );

    expect(app(ConsentService::class)->hasConsent(
        $user->subject_id,
        'fr026-revoke',
        ['openid', 'profile', 'email'],
    ))->toBeTrue();

    $this->withHeader('X-Request-Id', 'req-fr026-revoke')
        ->deleteJson('/api/profile/connected-apps/fr026-revoke', [], [
            'Authorization' => 'Bearer '.$tokens['access_token'],
        ])
        ->assertOk()
        ->assertJsonPath('client_id', 'fr026-revoke')
        ->assertJsonPath('revoked', true);

    // Refresh token revoked.
    expect(app(RefreshTokenStore::class)->findActive($tokens['refresh_token'], 'fr026-revoke'))->toBeNull();

    // Access token rejected by /userinfo (FR-026 acceptance #2).
    $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
        ->getJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');

    // Consent cleared (FR-026 acceptance #2: next /authorize must re-prompt).
    expect(app(ConsentService::class)->hasConsent(
        $user->subject_id,
        'fr026-revoke',
        ['openid', 'profile', 'email'],
    ))->toBeFalse();
});

it('rejects access tokens for a revoked connected app at the access guard layer', function (): void {
    config()->set('oidc_clients.clients.fr026-guard.display_name', 'FR026 Guard');
    config()->set('oidc_clients.clients.fr026-guard.allowed_scopes', ['openid', 'offline_access']);

    $user = fr026User('fr026-guard-subject');
    $tokens = fr026MintTokens($user, 'fr026-guard', 'fr026-guard-session');

    $this->deleteJson('/api/profile/connected-apps/fr026-guard', [], [
        'Authorization' => 'Bearer '.$tokens['access_token'],
    ])->assertOk();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom($tokens['access_token']))
        ->toThrow(RuntimeException::class);
});

function fr026User(string $subjectId): User
{
    return User::factory()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'email' => $subjectId.'@example.test',
        'email_verified_at' => now(),
        'display_name' => 'FR026 Tester',
        'status' => 'active',
    ]);
}

/**
 * @return array<string, mixed>
 */
function fr026MintTokens(User $user, string $clientId, string $sessionId): array
{
    return app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => $clientId,
        'scope' => 'openid offline_access',
        'session_id' => $sessionId,
        'auth_time' => time(),
        'amr' => ['pwd'],
        'upstream_refresh_token' => 'upstream-'.$clientId,
    ]);
}

/**
 * @return array<string, string>
 */
function fr026AuthHeaders(User $user, string $clientId, string $sessionId): array
{
    $tokens = fr026MintTokens($user, $clientId, $sessionId);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}
