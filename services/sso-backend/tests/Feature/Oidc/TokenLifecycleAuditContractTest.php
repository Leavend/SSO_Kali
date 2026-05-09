<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
        ],
    ]);
});

it('records token issuance refresh replay and revocation lifecycle audit events without token leakage', function (): void {
    $initial = issue81TokenSet();
    $issued = AuthenticationAuditEvent::query()->where('event_type', 'token_issued')->firstOrFail();

    expect($issued->outcome)->toBe('succeeded')
        ->and($issued->client_id)->toBe('app-a')
        ->and($issued->subject_id)->toBeString()->not->toBe('')
        ->and($issued->session_id)->toBeString()->not->toBe('')
        ->and($issued->ip_address)->toBe('203.0.113.91')
        ->and($issued->user_agent)->toBe('Issue81TokenAgent/issue')
        ->and($issued->request_id)->toBe('req-token-issued-81')
        ->and($issued->context)->toMatchArray([
            'grant_type' => 'authorization_code',
            'refresh_token_issued' => true,
            'scope' => 'openid profile email offline_access',
        ]);

    $rotated = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.92'])
        ->withHeader('User-Agent', 'Issue81TokenAgent/refresh')
        ->withHeader('X-Request-Id', 'req-token-refresh-81')
        ->postJson('/token', [
            'grant_type' => 'refresh_token',
            'client_id' => 'app-a',
            'refresh_token' => $initial['refresh_token'],
        ])->assertOk()->json();

    $refreshed = AuthenticationAuditEvent::query()->where('event_type', 'token_refreshed')->firstOrFail();
    expect($refreshed->outcome)->toBe('succeeded')
        ->and($refreshed->client_id)->toBe('app-a')
        ->and($refreshed->subject_id)->toBe($issued->subject_id)
        ->and($refreshed->session_id)->toBe($issued->session_id)
        ->and($refreshed->ip_address)->toBe('203.0.113.92')
        ->and($refreshed->user_agent)->toBe('Issue81TokenAgent/refresh')
        ->and($refreshed->request_id)->toBe('req-token-refresh-81')
        ->and($refreshed->context)->toMatchArray([
            'grant_type' => 'refresh_token',
            'refresh_token_rotated' => true,
            'scope' => 'openid profile email offline_access',
        ]);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.93'])
        ->withHeader('User-Agent', 'Issue81TokenAgent/replay')
        ->withHeader('X-Request-Id', 'req-token-replay-81')
        ->postJson('/token', [
            'grant_type' => 'refresh_token',
            'client_id' => 'app-a',
            'refresh_token' => $initial['refresh_token'],
        ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');

    $failed = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_request_failed')
        ->where('request_id', 'req-token-replay-81')
        ->firstOrFail();
    expect($failed->outcome)->toBe('failed')
        ->and($failed->client_id)->toBe('app-a')
        ->and($failed->error_code)->toBe('invalid_refresh_token')
        ->and($failed->context)->toMatchArray(['grant_type' => 'refresh_token']);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.94'])
        ->withHeader('User-Agent', 'Issue81TokenAgent/revoke')
        ->withHeader('X-Request-Id', 'req-token-revoke-81')
        ->postJson('/revocation', [
            'client_id' => 'app-a',
            'token' => (string) $rotated['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk();

    $revoked = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-token-revoke-81')
        ->firstOrFail();
    $encodedEvents = AuthenticationAuditEvent::query()->get()->toJson(JSON_THROW_ON_ERROR);

    expect($revoked->outcome)->toBe('succeeded')
        ->and($revoked->client_id)->toBe('app-a')
        ->and($revoked->ip_address)->toBe('203.0.113.94')
        ->and($revoked->user_agent)->toBe('Issue81TokenAgent/revoke')
        ->and($revoked->context)->toMatchArray([
            'token_type_hint' => 'refresh_token',
            'token_hash' => hash('sha256', (string) $rotated['refresh_token']),
            'refresh_token_revoked' => false,
            'access_token_revoked' => false,
        ])
        ->and($encodedEvents)->not->toContain($initial['refresh_token'])
        ->and($encodedEvents)->not->toContain((string) $rotated['refresh_token'])
        ->and($encodedEvents)->not->toContain($initial['access_token'])
        ->and($encodedEvents)->not->toContain($initial['id_token']);
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue81TokenSet(): array
{
    [$user, $sessionId] = issue81BrowserSessionUser();
    [$verifier, $challenge] = issue81PkcePair();

    $authorize = test()
        ->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => 'app-a',
            'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access',
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $authorize->assertRedirect();
    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    $token = test()
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.91'])
        ->withHeader('User-Agent', 'Issue81TokenAgent/issue')
        ->withHeader('X-Request-Id', 'req-token-issued-81')
        ->postJson('/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'app-a',
            'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
            'code' => (string) $query['code'],
            'code_verifier' => $verifier,
        ])->assertOk();

    return [
        'access_token' => (string) $token->json('access_token'),
        'id_token' => (string) $token->json('id_token'),
        'refresh_token' => (string) $token->json('refresh_token'),
    ];
}

/**
 * @return array{0: User, 1: string}
 */
function issue81BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue81-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'TokenLifecycleAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue81PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
