<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LocalLogoutTokenVerifier;
use App\Services\Oidc\LogoutTokenService;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;

it('rejects centralized logout without bearer token', function (): void {
    $this->postJson('/connect/logout')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('queues back-channel logout for every registered client session', function (): void {
    Bus::fake();

    $subjectId = 'user-fr002';
    $sessionId = 'sid-fr002';
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

it('posts a standards-compliant logout token to the client back-channel endpoint', function (): void {
    Http::fake([
        'https://app-a.example.test/backchannel/logout' => Http::response([], 200),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'app-a',
        'user-fr002',
        'sid-fr002',
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
            && ($claims['sub'] ?? null) === 'user-fr002'
            && ($claims['sid'] ?? null) === 'sid-fr002'
            && isset($claims['jti'])
            && isset($claims['events']['http://schemas.openid.net/event/backchannel-logout'])
            && ! array_key_exists('nonce', $claims);
    });
});

it('fails safely when a back-channel client returns a non-success response', function (): void {
    Http::fake([
        'https://app-a.example.test/backchannel/logout' => Http::response(['error' => 'failed'], 400),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'app-a',
        'user-fr002',
        'sid-fr002',
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
        ->assertJsonPath('revoked', false)
        ->assertCookieExpired(config('sso.session.cookie'));
});

function bearerHeaders(string $subjectId, string $sessionId): array
{
    return ['Authorization' => 'Bearer '.accessTokenFor($subjectId, $sessionId)];
}

function accessTokenFor(string $subjectId, string $sessionId): string
{
    return app(SigningKeyService::class)->sign([
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
    ]);
}

function registerBackChannelClient(string $sessionId, string $clientId, string $logoutUri): void
{
    app(BackChannelSessionRegistry::class)->register($sessionId, $clientId, $logoutUri);
}
