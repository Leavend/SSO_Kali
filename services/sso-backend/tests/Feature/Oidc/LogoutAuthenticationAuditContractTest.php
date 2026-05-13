<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');
    config()->set('sso.session.cookie', '__Host-sso_session');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a/signed-out'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b/signed-out'],
        ],
    ]);
});

it('records front-channel logout success and failure in the central authentication audit store without protocol leakage', function (): void {
    [$user, $sessionId] = issue83BrowserSessionUser();
    $redirectUri = 'https://sso.timeh.my.id/app-a/signed-out';
    $state = 'logout-state-'.Str::random(24);

    $this->withHeader('Cookie', '__Host-sso_session='.$sessionId)
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.131'])
        ->withHeader('User-Agent', 'Issue83LogoutAgent/front-success')
        ->withHeader('X-Request-Id', 'req-front-logout-success-83')
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'post_logout_redirect_uri' => $redirectUri,
            'state' => $state,
        ]))->assertRedirect($redirectUri.'?'.http_build_query(['state' => $state]));

    $completed = AuthenticationAuditEvent::query()
        ->where('event_type', 'frontchannel_logout_completed')
        ->where('request_id', 'req-front-logout-success-83')
        ->where('session_id', $sessionId)
        ->orderByDesc('id')
        ->firstOrFail();
    $encodedCompleted = json_encode($completed->toArray(), JSON_THROW_ON_ERROR);

    expect($completed->outcome)->toBe('succeeded')
        ->and($completed->subject_id)->toBe((string) $user->id)
        ->and($completed->client_id)->toBe('app-a')
        ->and($completed->session_id)->toBe($sessionId)
        ->and($completed->ip_address)->toBe('203.0.113.131')
        ->and($completed->user_agent)->toBe('Issue83LogoutAgent/front-success')
        ->and($completed->context)->toMatchArray([
            'logout_channel' => 'frontchannel',
            'result' => 'succeeded',
            'post_logout_redirect_uri_hash' => hash('sha256', $redirectUri),
            'state_hash' => hash('sha256', $state),
        ])
        ->and($encodedCompleted)->not->toContain($redirectUri)
        ->and($encodedCompleted)->not->toContain($state);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.132'])
        ->withHeader('User-Agent', 'Issue83LogoutAgent/front-failure')
        ->withHeader('X-Request-Id', 'req-front-logout-failed-83')
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'app-a',
            'post_logout_redirect_uri' => 'https://evil.example/signed-out',
            'state' => 'failed-state-'.Str::random(24),
        ]))->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request');

    $failed = AuthenticationAuditEvent::query()
        ->where('event_type', 'frontchannel_logout_failed')
        ->where('request_id', 'req-front-logout-failed-83')
        ->firstOrFail();

    expect($failed->outcome)->toBe('failed')
        ->and($failed->client_id)->toBe('app-a')
        ->and($failed->error_code)->toBe('invalid_post_logout_redirect_uri')
        ->and($failed->context)->toMatchArray([
            'logout_channel' => 'frontchannel',
            'result' => 'failed',
            'failure_class' => 'invalid_post_logout_redirect_uri',
        ]);
});

it('records centralized logout success and invalid-token failure in the central authentication audit store', function (): void {
    [$user, $sessionId] = issue83BrowserSessionUser();
    $accessToken = issue83AccessToken($user, $sessionId);

    $this->withToken($accessToken)
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.133'])
        ->withHeader('User-Agent', 'Issue83LogoutAgent/central-success')
        ->withHeader('X-Request-Id', 'req-central-logout-success-83')
        ->postJson('/connect/logout')
        ->assertOk()
        ->assertJsonPath('signed_out', true);

    $completed = AuthenticationAuditEvent::query()
        ->where('event_type', 'sso_logout_completed')
        ->where('request_id', 'req-central-logout-success-83')
        ->firstOrFail();

    expect($completed->outcome)->toBe('succeeded')
        ->and($completed->subject_id)->toBe($user->subject_id)
        ->and($completed->session_id)->toBe($sessionId)
        ->and($completed->ip_address)->toBe('203.0.113.133')
        ->and($completed->user_agent)->toBe('Issue83LogoutAgent/central-success')
        ->and($completed->context)->toMatchArray([
            'logout_channel' => 'centralized',
            'result' => 'succeeded',
            'session_count' => 1,
        ]);

    $this->withToken('not-a-valid-token')
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.134'])
        ->withHeader('User-Agent', 'Issue83LogoutAgent/central-failed')
        ->withHeader('X-Request-Id', 'req-central-logout-failed-83')
        ->postJson('/connect/logout')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');

    $failed = AuthenticationAuditEvent::query()
        ->where('event_type', 'sso_logout_failed')
        ->where('request_id', 'req-central-logout-failed-83')
        ->firstOrFail();

    expect($failed->outcome)->toBe('failed')
        ->and($failed->error_code)->toBe('invalid_token')
        ->and($failed->ip_address)->toBe('203.0.113.134')
        ->and($failed->user_agent)->toBe('Issue83LogoutAgent/central-failed')
        ->and($failed->context)->toMatchArray([
            'logout_channel' => 'centralized',
            'result' => 'failed',
            'reason' => 'invalid_token',
            'failure_class' => 'invalid_token',
        ]);
});

/**
 * @return array{0: User, 1: string}
 */
function issue83BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue83-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'LogoutAuthenticationAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function issue83AccessToken(User $user, string $sessionId): string
{
    return app(SigningKeyService::class)->sign([
        'iss' => 'https://api-sso.timeh.my.id',
        'aud' => 'sso-api',
        'sub' => $user->subject_id,
        'sid' => $sessionId,
        'client_id' => 'app-a',
        'token_use' => 'access',
        'scope' => 'openid profile email',
        'jti' => (string) Str::uuid(),
        'iat' => time(),
        'exp' => now()->addMinutes(15)->timestamp,
    ]);
}
