<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.session.cookie', '__Host-sso_session');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a/signed-out'],
        ],
    ]);
});

it('rejects RP-initiated logout when id_token_hint sid does not match the active SSO session', function (): void {
    [, $sessionId] = idTokenHintBoundSession();
    $hint = idTokenHintWithSid('some-other-session-id');

    $response = $this->withHeader('Cookie', '__Host-sso_session='.$sessionId)
        ->withHeader('X-Request-Id', 'req-fr041-mismatch')
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'id_token_hint' => $hint,
        ]));

    $response->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request');

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'frontchannel_logout_failed')
        ->where('request_id', 'req-fr041-mismatch')
        ->firstOrFail();

    expect($event->error_code)->toBe('id_token_hint_session_mismatch');
});

it('still accepts RP-initiated logout when id_token_hint sid matches the active SSO session', function (): void {
    [$user, $sessionId] = idTokenHintBoundSession();
    $hint = idTokenHintWithSid($sessionId, $user->subject_id);

    $this->withHeader('Cookie', '__Host-sso_session='.$sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'id_token_hint' => $hint,
            'post_logout_redirect_uri' => 'https://sso.timeh.my.id/app-a/signed-out',
        ]))
        ->assertRedirect('https://sso.timeh.my.id/app-a/signed-out');
});

it('does not call the sid binding check when no id_token_hint is supplied', function (): void {
    [, $sessionId] = idTokenHintBoundSession();

    $this->withHeader('Cookie', '__Host-sso_session='.$sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'post_logout_redirect_uri' => 'https://sso.timeh.my.id/app-a/signed-out',
        ]))
        ->assertRedirect('https://sso.timeh.my.id/app-a/signed-out');
});

/**
 * @return array{0: User, 1: string}
 */
function idTokenHintBoundSession(): array
{
    $user = User::factory()->create([
        'email' => 'fr041-'.Str::random(10).'@example.test',
    ]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'IdTokenHintSidContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function idTokenHintWithSid(string $sid, ?string $sub = null): string
{
    return app(SigningKeyService::class)->sign([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'app-a',
        'sub' => $sub ?? 'subject-mismatch',
        'sid' => $sid,
        'iat' => time(),
        'exp' => time() + 600,
        'nonce' => 'nonce-'.Str::random(8),
    ]);
}
