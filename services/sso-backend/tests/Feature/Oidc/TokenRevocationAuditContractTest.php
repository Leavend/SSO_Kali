<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\SigningKeyService;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\DB;
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

it('records refresh-token revocation audit with family correlation hash and no raw token leakage', function (): void {
    $tokens = issue82TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $record = issue82RefreshRecord($tokens['refresh_token']);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.121'])
        ->withHeader('User-Agent', 'Issue82RevocationAgent/refresh')
        ->withHeader('X-Request-Id', 'req-revoke-refresh-82')
        ->postJson('/revocation', [
            'client_id' => 'app-a',
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-refresh-82')
        ->firstOrFail();
    $encodedEvent = json_encode($event->toArray(), JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-a')
        ->and($event->ip_address)->toBe('203.0.113.121')
        ->and($event->user_agent)->toBe('Issue82RevocationAgent/refresh')
        ->and($event->context)->toMatchArray([
            'token_type_hint' => 'refresh_token',
            'token_class' => 'refresh_token',
            'token_hash' => hash('sha256', $tokens['refresh_token']),
            'refresh_token_revoked' => true,
            'access_token_revoked' => false,
            'refresh_token_family_hash' => hash('sha256', (string) $record->token_family_id),
            'idempotent_unknown_token' => false,
        ])
        ->and($encodedEvent)->not->toContain($tokens['refresh_token'])
        ->and($encodedEvent)->not->toContain($tokens['access_token'])
        ->and($encodedEvent)->not->toContain($tokens['id_token'])
        ->and($encodedEvent)->not->toContain((string) $record->token_family_id);
});

it('records access-token revocation audit with jti correlation hash and no raw token leakage', function (): void {
    $tokens = issue82TokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');
    $claims = app(SigningKeyService::class)->decode($tokens['access_token']);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.122'])
        ->withHeader('User-Agent', 'Issue82RevocationAgent/access')
        ->withHeader('X-Request-Id', 'req-revoke-access-82')
        ->postJson('/revocation', [
            'client_id' => 'app-a',
            'token' => $tokens['access_token'],
            'token_type_hint' => 'access_token',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-access-82')
        ->firstOrFail();
    $encodedEvent = json_encode($event->toArray(), JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-a')
        ->and($event->context)->toMatchArray([
            'token_type_hint' => 'access_token',
            'token_class' => 'access_token',
            'token_hash' => hash('sha256', $tokens['access_token']),
            'refresh_token_revoked' => false,
            'access_token_revoked' => true,
            'access_token_jti_hash' => hash('sha256', (string) $claims['jti']),
            'idempotent_unknown_token' => false,
        ])
        ->and($encodedEvent)->not->toContain($tokens['access_token'])
        ->and($encodedEvent)->not->toContain((string) $claims['jti']);
});

it('records rfc7009 idempotent unknown-token and invalid-client revocation audits safely', function (): void {
    $unknownToken = 'opaque-unknown-token-'.Str::random(24);
    $confidential = issue82TokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.123'])
        ->withHeader('User-Agent', 'Issue82RevocationAgent/unknown')
        ->withHeader('X-Request-Id', 'req-revoke-unknown-82')
        ->postJson('/revocation', [
            'client_id' => 'app-a',
            'token' => $unknownToken,
            'token_type_hint' => 'access_token',
        ])->assertOk()
        ->assertExactJson([]);

    $unknown = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-unknown-82')
        ->firstOrFail();

    expect($unknown->outcome)->toBe('succeeded')
        ->and($unknown->error_code)->toBeNull()
        ->and($unknown->context)->toMatchArray([
            'token_class' => 'access_token',
            'token_hash' => hash('sha256', $unknownToken),
            'refresh_token_revoked' => false,
            'access_token_revoked' => false,
            'idempotent_unknown_token' => true,
        ]);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.124'])
        ->withHeader('User-Agent', 'Issue82RevocationAgent/invalid-client')
        ->withHeader('X-Request-Id', 'req-revoke-invalid-client-82')
        ->postJson('/revocation', [
            'client_id' => 'app-b',
            'client_secret' => 'wrong-secret',
            'token' => $confidential['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    $invalidClient = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-invalid-client-82')
        ->firstOrFail();
    $encodedEvents = AuthenticationAuditEvent::query()->get()->toJson(JSON_THROW_ON_ERROR);

    expect($invalidClient->outcome)->toBe('failed')
        ->and($invalidClient->client_id)->toBe('app-b')
        ->and($invalidClient->error_code)->toBe('invalid_secret')
        ->and($invalidClient->context)->toMatchArray([
            'token_type_hint' => 'refresh_token',
            'token_hash' => hash('sha256', $confidential['refresh_token']),
        ])
        ->and(issue82RefreshRecord($confidential['refresh_token'])->revoked_at)->toBeNull()
        ->and($encodedEvents)->not->toContain($unknownToken)
        ->and($encodedEvents)->not->toContain($confidential['refresh_token'])
        ->and($encodedEvents)->not->toContain('wrong-secret');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function issue82TokenSet(string $clientId, string $redirectUri, ?string $clientSecret = null): array
{
    [$user, $sessionId] = issue82BrowserSessionUser();
    [$verifier, $challenge] = issue82PkcePair();

    $authorize = test()
        ->withSession([
            'sso_browser_session' => [
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

    $payload = [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'code' => (string) $query['code'],
        'code_verifier' => $verifier,
    ];

    if ($clientSecret !== null) {
        $payload['client_secret'] = $clientSecret;
    }

    $token = test()->postJson('/token', $payload)->assertOk();

    return [
        'access_token' => (string) $token->json('access_token'),
        'id_token' => (string) $token->json('id_token'),
        'refresh_token' => (string) $token->json('refresh_token'),
    ];
}

function issue82RefreshRecord(string $plainToken): object
{
    $tokenId = issue82RefreshTokenId($plainToken);
    $record = DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->first();

    expect($record)->not->toBeNull();

    return $record;
}

function issue82RefreshTokenId(string $plainToken): string
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return $parts[0];
}

/**
 * @return array{0: User, 1: string}
 */
function issue82BrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'issue82-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'TokenRevocationAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue82PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
