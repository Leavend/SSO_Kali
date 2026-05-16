<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
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
    app(DownstreamClientRegistry::class)->flush();
});

it('accepts revocation when confidential client authenticates with HTTP Basic per RFC 6749', function (): void {
    $tokens = revokeBasicTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->withHeader('X-Request-Id', 'req-revoke-basic-success')
        ->postJson('/revocation', [
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-basic-success')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-b')
        ->and($event->context['refresh_token_revoked'] ?? null)->toBeTrue();
});

it('rejects revocation idempotently when HTTP Basic credentials are wrong without revoking the token', function (): void {
    $tokens = revokeBasicTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:not-the-secret'))
        ->withHeader('X-Request-Id', 'req-revoke-basic-bad')
        ->postJson('/revocation', [
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-basic-bad')
        ->firstOrFail();

    $tokenId = revokeBasicRefreshTokenId($tokens['refresh_token']);
    $row = DB::table('refresh_token_rotations')->where('refresh_token_id', $tokenId)->firstOrFail();

    expect($event->outcome)->toBe('failed')
        ->and($event->error_code)->toBe('invalid_secret')
        ->and($row->revoked_at)->toBeNull();
});

it('prefers HTTP Basic credentials over body credentials per RFC 6749 §2.3.1', function (): void {
    $tokens = revokeBasicTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    // Basic carries the wrong secret so revocation MUST fail even though the
    // body has the correct secret. This proves Basic precedence is enforced.
    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:wrong-secret'))
        ->withHeader('X-Request-Id', 'req-revoke-basic-precedence')
        ->postJson('/revocation', [
            'client_id' => 'app-b',
            'client_secret' => 'app-b-secret',
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-basic-precedence')
        ->firstOrFail();

    expect($event->outcome)->toBe('failed')
        ->and($event->error_code)->toBe('invalid_secret');
});

it('handles unsupported token_type_hint values without leaking technical details', function (): void {
    $tokens = revokeBasicTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->withHeader('X-Request-Id', 'req-revoke-bad-hint')
        ->postJson('/revocation', [
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'something_unknown',
        ])->assertOk()
        ->assertExactJson([]);

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-revoke-bad-hint')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->context['token_type_hint'])->toBe('something_unknown');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function revokeBasicTokenSet(string $clientId, string $redirectUri, ?string $clientSecret = null): array
{
    [$user, $sessionId] = revokeBasicBrowserSessionUser();
    [$verifier, $challenge] = revokeBasicPkcePair();

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

function revokeBasicRefreshTokenId(string $plainToken): string
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);

    expect($parts)->toHaveCount(2);

    return $parts[0];
}

/**
 * @return array{0: User, 1: string}
 */
function revokeBasicBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'rev-basic-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'RevokeBasicContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function revokeBasicPkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
