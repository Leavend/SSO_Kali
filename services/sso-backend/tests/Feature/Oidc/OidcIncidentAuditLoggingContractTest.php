<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
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

it('records token endpoint protocol failures as redacted OIDC security incidents', function (): void {
    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => 'stolen-code',
        'code_verifier' => 'secret-verifier',
        'client_secret' => 'should-not-be-stored',
    ], ['X-Request-Id' => 'issue54-token-failure'])->assertStatus(400);

    $event = issue54LatestIncident('oidc_token_endpoint_failure');

    expect($event->outcome)->toBe('denied')
        ->and($event->taxonomy)->toBe('oidc.security_incident')
        ->and($event->reason)->toBe('invalid_authorization_code')
        ->and($event->context['client_id'])->toBe('app-a')
        ->and($event->context['request_id'])->toBe('issue54-token-failure')
        ->and($event->context['grant_type'])->toBe('authorization_code')
        ->and($event->context['input'])->not->toHaveKey('client_secret')
        ->and($event->context['input'])->not->toHaveKey('code')
        ->and($event->context['input'])->not->toHaveKey('code_verifier');
});

it('records refresh token replay attempts as OIDC security incidents without storing token material', function (): void {
    $tokens = issue54TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertOk();

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'app-a',
        'refresh_token' => $tokens['refresh_token'],
    ], ['X-Request-Id' => 'issue54-refresh-replay'])->assertStatus(400);

    $event = issue54LatestIncident('oidc_token_endpoint_failure');

    expect($event->reason)->toBe('invalid_refresh_token')
        ->and($event->context['request_id'])->toBe('issue54-refresh-replay')
        ->and($event->context['client_id'])->toBe('app-a')
        ->and($event->context['input'])->not->toHaveKey('refresh_token');
});

it('records userinfo invalid bearer attempts as OIDC security incidents', function (): void {
    $this->withToken('not-a-jwt')
        ->getJson('/userinfo', ['X-Request-Id' => 'issue54-userinfo-invalid'])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');

    $event = issue54LatestIncident('oidc_userinfo_invalid_token');

    expect($event->reason)->toBe('invalid_token')
        ->and($event->path)->toBe('userinfo')
        ->and($event->context['request_id'])->toBe('issue54-userinfo-invalid')
        ->and($event->context['input'])->toBe([]);
});

it('records revocation invalid client attempts while preserving RFC7009 success semantics', function (): void {
    $this->postJson('/revocation', [
        'client_id' => 'app-b',
        'client_secret' => 'wrong-secret',
        'token' => 'rt_secret-token-material',
        'token_type_hint' => 'refresh_token',
    ], ['X-Request-Id' => 'issue54-revocation-invalid'])->assertOk()
        ->assertExactJson([]);

    $event = issue54LatestIncident('oidc_revocation_invalid_client');

    expect($event->reason)->toBe('invalid_secret')
        ->and($event->context['client_id'])->toBe('app-b')
        ->and($event->context['request_id'])->toBe('issue54-revocation-invalid')
        ->and($event->context['input'])->not->toHaveKey('client_secret')
        ->and($event->context['input'])->not->toHaveKey('token');
});

it('keeps audit events immutable and chained for OIDC incidents', function (): void {
    $this->postJson('/token', [
        'grant_type' => 'unsupported-grant',
        'client_id' => 'app-a',
    ])->assertStatus(400);

    $this->withToken('invalid-token')->getJson('/userinfo')->assertStatus(401);

    $events = AdminAuditEvent::query()
        ->where('taxonomy', 'oidc.security_incident')
        ->orderBy('id')
        ->get();

    expect($events)->toHaveCount(2)
        ->and($events[0]->event_hash)->not->toBeNull()
        ->and($events[1]->previous_hash)->toBe($events[0]->event_hash);
});

function issue54LatestIncident(string $action): AdminAuditEvent
{
    $event = AdminAuditEvent::query()
        ->where('action', $action)
        ->where('taxonomy', 'oidc.security_incident')
        ->latest('id')
        ->first();

    expect($event)->toBeInstanceOf(AdminAuditEvent::class);

    return $event;
}

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue54TokenSet(string $clientId, string $redirectUri): array
{
    [$user, $sessionId] = issue54BrowserSessionUser();
    [$verifier, $challenge] = issue54PkcePair();

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
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access',
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $authorize->assertRedirect();
    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    $token = test()->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
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
function issue54BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue54-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Issue54OidcIncidentAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue54PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
