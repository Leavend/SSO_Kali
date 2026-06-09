<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalLogoutTokenVerifier;
use App\Services\Oidc\LogoutTokenService;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config()->set('oidc_clients.clients.app-a', [
        'type' => 'public',
        'redirect_uris' => ['https://app-a.example.test/callback'],
        'post_logout_redirect_uris' => ['https://app-a.example.test/signed-out'],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('rejects centralized logout without bearer token', function (): void {
    $this->postJson('/connect/logout')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('rejects centralized logout with malformed or incomplete access tokens', function (string $token): void {
    $this->postJson('/connect/logout', [], ['Authorization' => 'Bearer '.$token])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
})->with([
    'malformed token' => 'not-a-jwt',
    'missing sid' => fn (): string => accessTokenFor('user-logoutFlow', null),
    'missing sub' => fn (): string => accessTokenFor(null, 'sid-logoutFlow'),
    'expired token' => fn (): string => accessTokenFor('user-logoutFlow', 'sid-logoutFlow', ['exp' => time() - 120]),
]);

it('queues back-channel logout for every registered client session', function (): void {
    Bus::fake();

    $subjectId = 'user-logoutFlow';
    $sessionId = 'sid-logoutFlow';
    registerBackChannelClient($sessionId, 'app-a', 'https://app-a.example.test/backchannel/logout');
    registerBackChannelClient($sessionId, 'app-b', 'https://app-b.example.test/backchannel/logout');

    $this->postJson('/connect/logout', [], bearerHeaders($subjectId, $sessionId))
        ->assertOk()
        ->assertJsonPath('signed_out', true)
        ->assertJsonPath('sid', $sessionId)
        ->assertJsonCount(2, 'notifications');

    Bus::assertDispatched(DispatchBackChannelLogoutJob::class, 2);
    expect(app(BackChannelSessionRegistry::class)->forSession($sessionId))->toBe([]);
});

it('revokes the admin panel access tokens for the subject during centralized logout', function (): void {
    Bus::fake();

    $subjectId = 'user-admin-slo';
    $portalSessionId = 'sid-portal-admin-slo';
    $adminSessionId = 'sid-admin-admin-slo';
    $adminClientId = (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    $revocations = app(AccessTokenRevocationStore::class);

    // An active admin-panel access token, tracked at issuance the way LocalTokenService does.
    $adminJti = 'jti-admin-'.str()->uuid();
    $revocations->track($adminSessionId, $adminJti, time() + 300, $adminClientId, $subjectId);
    expect($revocations->revoked($adminJti))->toBeFalse();

    // The same user signs out centrally from a different (e.g. portal) session.
    $this->postJson('/connect/logout', [], bearerHeaders($subjectId, $portalSessionId))
        ->assertOk()
        ->assertJsonPath('signed_out', true);

    // Single sign-out MUST also revoke the admin panel's access tokens for the subject,
    // otherwise the admin BFF keeps accepting the still-valid access token and the admin
    // panel stays reachable after the portal has logged out.
    expect($revocations->revoked($adminJti))->toBeTrue();
});

it('terminates a registered admin panel session when the user logs out from the portal', function (): void {
    Bus::fake();

    // Reproduces the reported production bug end-to-end through the registration
    // path: an admin panel session that the admin BFF registered with the IdP
    // (session-registration.ts) must be terminated when the same user signs out
    // from the portal — otherwise admin-sso stays reachable after portal logout.
    $subjectId = 'user-cross-app-slo';
    $portalSessionId = 'sid-portal-cross-slo';
    $adminSessionId = 'sid-admin-cross-slo';
    $adminClientId = (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    $registry = app(BackChannelSessionRegistry::class);
    $revocations = app(AccessTokenRevocationStore::class);

    // The admin BFF registered its RP session at login (sid == the access token's
    // sid claim), and the admin access token was tracked the way LocalTokenService
    // tracks it at issuance.
    $registry->register(
        $adminSessionId,
        $adminClientId,
        'https://api-sso.example.test/connect/backchannel/admin-panel/logout',
        ['subject_id' => $subjectId],
    );
    $adminJti = 'jti-admin-cross-'.str()->uuid();
    $revocations->track($adminSessionId, $adminJti, time() + 300, $adminClientId, $subjectId);

    // Precondition: admin session is discoverable for the subject and its token is live.
    expect($registry->sessionIdsForSubject($subjectId))->toContain($adminSessionId)
        ->and($revocations->revoked($adminJti))->toBeFalse();

    // The SAME user signs out from a different (portal) session.
    $this->postJson('/connect/logout', [], bearerHeaders($subjectId, $portalSessionId))
        ->assertOk()
        ->assertJsonPath('signed_out', true);

    // The admin panel is now terminated: its access token is revoked (so the admin
    // BFF's next backend call returns 401 and the SPA redirects to login) and its RP
    // session is cleared from the registry.
    expect($revocations->revoked($adminJti))->toBeTrue()
        ->and($registry->forSession($adminSessionId))->toBe([]);
});

it('dedupes duplicate global logout requests by sid sub and request id', function (): void {
    Bus::fake();

    $subjectId = 'user-logout-dedupe';
    $sessionId = 'sid-logout-dedupe';
    registerBackChannelClient($sessionId, 'app-a', 'https://app-a.example.test/backchannel/logout');

    $headers = bearerHeaders($subjectId, $sessionId) + ['X-Request-Id' => 'req-logout-dedupe'];

    $first = $this->postJson('/connect/logout', [], $headers)->assertOk()->json();
    $second = $this->postJson('/connect/logout', [], $headers)->assertOk()->json();

    expect($first['idempotent_replay'] ?? false)->toBeFalse()
        ->and($second['idempotent_replay'])->toBeTrue()
        ->and($second['sid'])->toBe($sessionId);

    Bus::assertDispatched(DispatchBackChannelLogoutJob::class, 1);
});

it('propagates parent request id into queued back-channel logout jobs', function (): void {
    Bus::fake();

    $subjectId = 'user-logout-request-id';
    $sessionId = 'sid-logout-request-id';
    registerBackChannelClient($sessionId, 'app-a', 'https://app-a.example.test/backchannel/logout');

    $this->postJson('/connect/logout', [], bearerHeaders($subjectId, $sessionId) + [
        'X-Request-Id' => 'req-parent-bcl-123',
    ])->assertOk();

    Bus::assertDispatched(DispatchBackChannelLogoutJob::class, fn (DispatchBackChannelLogoutJob $job): bool => $job->requestId === 'req-parent-bcl-123');
});

it('posts a standards-compliant logout token to the client back-channel endpoint', function (): void {
    Http::fake([
        'https://app-a.example.test/backchannel/logout' => Http::response([], 200),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'app-a',
        'user-logoutFlow',
        'sid-logoutFlow',
        'https://app-a.example.test/backchannel/logout',
    );

    $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class));

    Http::assertSent(function ($request): bool {
        $claims = app(LocalLogoutTokenVerifier::class)->verify(
            (string) data_get($request->data(), 'logout_token'),
            'app-a',
        );

        return $request->url() === 'https://app-a.example.test/backchannel/logout'
            && $request->method() === 'POST'
            && ($claims['iss'] ?? null) === config('sso.issuer')
            && ($claims['aud'] ?? null) === 'app-a'
            && ($claims['sub'] ?? null) === 'user-logoutFlow'
            && ($claims['sid'] ?? null) === 'sid-logoutFlow'
            && is_string($claims['jti'] ?? null)
            && is_int($claims['iat'] ?? null)
            && is_int($claims['exp'] ?? null)
            && ($claims['exp'] ?? 0) > ($claims['iat'] ?? PHP_INT_MAX)
            && isset($claims['events']['http://schemas.openid.net/event/backchannel-logout'])
            && ! array_key_exists('nonce', $claims);
    });
});

it('emits a terminal dead-letter audit event when back-channel retries are exhausted', function (): void {
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'app-a',
        'user-logoutFlow',
        'sid-logoutFlow',
        'https://app-a.example.test/backchannel/logout',
        'req-dead-letter-123',
    );

    $job->failed(new RuntimeException('RP unavailable after retries'));

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_dead_lettered'
                && ($payload['request_id'] ?? null) === 'req-dead-letter-123'
                && data_get($payload, 'context.terminal') === true
                && data_get($payload, 'context.failure_class') === 'retry_exhausted';
        }));
});

it('fails safely when a back-channel client returns a non-success response', function (): void {
    Http::fake([
        'https://app-a.example.test/backchannel/logout' => Http::response(['error' => 'failed'], 400),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'app-a',
        'user-logoutFlow',
        'sid-logoutFlow',
        'https://app-a.example.test/backchannel/logout',
    );

    expect(fn () => $job->handle(
        app(LogoutTokenService::class),
        app(RecordLogoutAuditEventAction::class),
    ))->toThrow(RuntimeException::class, 'Back-channel logout failed');
});

it('clears the SSO cookie during front-channel logout', function (): void {
    $this->postJson('/api/auth/logout')
        ->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('revoked', false);
});

function bearerHeaders(string $subjectId, string $sessionId): array
{
    return ['Authorization' => 'Bearer '.accessTokenFor($subjectId, $sessionId)];
}

function accessTokenFor(?string $subjectId, ?string $sessionId, array $overrides = []): string
{
    return app(SigningKeyService::class)->sign(array_merge([
        'iss' => config('sso.issuer'),
        'aud' => config('sso.resource_audience'),
        'sub' => $subjectId,
        'sid' => $sessionId,
        'jti' => 'jti-'.str()->uuid(),
        'client_id' => 'app-a',
        'scope' => 'openid profile email',
        'token_use' => 'access',
        'iat' => time(),
        'exp' => time() + 300,
    ], $overrides));
}

function registerBackChannelClient(string $sessionId, string $clientId, string $logoutUri): void
{
    app(BackChannelSessionRegistry::class)->register($sessionId, $clientId, $logoutUri);
}
