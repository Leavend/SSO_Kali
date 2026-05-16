<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * BE-FR034-001 — Public-client Revocation Contract.
 *
 * Locks the public-client semantics for `/revocation`:
 *
 *   1. A public client (PKCE, no `client_secret`) revokes its own
 *      refresh token without supplying any secret. The audit row
 *      records `auth_method=none` so the policy is observable.
 *   2. A public client cannot revoke a confidential client's token
 *      (cross-client revocation is rejected RFC 7009-idempotently).
 *   3. The endpoint refuses to enumerate hint enums — supplying a
 *      bogus `token_type_hint` is accepted (RFC 7009 §2.1) and
 *      preserved verbatim in audit context, with no leak in the
 *      response body.
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-api');

    config()->set('oidc_clients.clients', [
        'app-public' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-public/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-public'],
        ],
        'app-confidential' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-confidential-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-confidential/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-confidential'],
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('revokes a public client refresh token without a client_secret and records auth_method=none', function (): void {
    $tokens = publicRevokeTokenSet('app-public', 'https://sso.timeh.my.id/app-public/auth/callback');

    test()
        ->withHeader('X-Request-Id', 'req-public-revoke-success')
        ->postJson('/revocation', [
            'client_id' => 'app-public',
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    expect(publicRevokeRefreshRecord($tokens['refresh_token'])->revoked_at)->not->toBeNull();

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-public-revoke-success')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-public')
        ->and($event->context['refresh_token_revoked'] ?? null)->toBeTrue()
        ->and($event->context['auth_method'] ?? null)->toBe('none');
});

it('rejects a public client trying to revoke a confidential client token without revoking it', function (): void {
    $tokens = publicRevokeTokenSet(
        'app-confidential',
        'https://sso.timeh.my.id/app-confidential/auth/callback',
        clientSecret: 'app-confidential-secret',
    );

    test()
        ->withHeader('X-Request-Id', 'req-public-cross-client')
        ->postJson('/revocation', [
            'client_id' => 'app-public',
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson([]);

    expect(publicRevokeRefreshRecord($tokens['refresh_token'])->revoked_at)->toBeNull();

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-public-cross-client')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-public')
        ->and($event->context['idempotent_unknown_token'] ?? null)->toBeTrue();
});

it('preserves an unsupported token_type_hint in audit context and does not leak detail in the body', function (): void {
    $tokens = publicRevokeTokenSet('app-public', 'https://sso.timeh.my.id/app-public/auth/callback');

    $response = test()
        ->withHeader('X-Request-Id', 'req-public-bad-hint')
        ->postJson('/revocation', [
            'client_id' => 'app-public',
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'totally-bogus-hint',
        ])->assertOk()
        ->assertExactJson([]);

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_revoked')
        ->where('request_id', 'req-public-bad-hint')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->context['token_type_hint'] ?? null)->toBe('totally-bogus-hint');
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function publicRevokeTokenSet(string $clientId, string $redirectUri, ?string $clientSecret = null): array
{
    [$user, $sessionId] = publicRevokeBrowserSessionUser();
    [$verifier, $challenge] = publicRevokePkcePair();

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

function publicRevokeRefreshRecord(string $plainToken): object
{
    expect($plainToken)->toStartWith('rt_');
    $parts = explode('.', substr($plainToken, 3), 2);
    expect($parts)->toHaveCount(2);

    $record = DB::table('refresh_token_rotations')
        ->where('refresh_token_id', $parts[0])
        ->first();

    expect($record)->not->toBeNull();

    return $record;
}

/**
 * @return array{0: User, 1: string}
 */
function publicRevokeBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'public-revoke-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PublicClientRevocationContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function publicRevokePkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
