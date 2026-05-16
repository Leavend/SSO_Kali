<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
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

it('returns a structured active introspection response for a valid access token whose client matches the caller', function (): void {
    $tokens = introspectTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $response = $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/introspect', [
            'token' => $tokens['access_token'],
            'token_type_hint' => 'access_token',
        ])->assertOk();

    $response
        ->assertJsonPath('active', true)
        ->assertJsonPath('client_id', 'app-b')
        ->assertJsonPath('token_type', 'Bearer')
        ->assertJsonPath('token_use', 'access')
        ->assertJsonPath('iss', 'https://api-sso.timeh.my.id');

    expect($response->json('exp'))->toBeInt()
        ->and($response->json('iat'))->toBeInt()
        ->and($response->json('sub'))->toBeString()
        ->and($response->json('sid'))->toBeString()
        ->and($response->json('jti'))->toBeString();
});

it('returns active false when the access token has been revoked since issuance', function (): void {
    $tokens = introspectTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');
    $claims = app(SigningKeyService::class)->decode($tokens['access_token']);

    app(AccessTokenRevocationStore::class)->revoke((string) $claims['jti'], 900);

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/introspect', [
            'token' => $tokens['access_token'],
            'token_type_hint' => 'access_token',
        ])->assertOk()
        ->assertExactJson(['active' => false]);
});

it('returns active false for refresh tokens that belong to another client to prevent cross-client disclosure', function (): void {
    $tokens = introspectTokenSet('app-a', 'https://sso.timeh.my.id/app-a/auth/callback');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/introspect', [
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk()
        ->assertExactJson(['active' => false]);
});

it('returns active true for a refresh token introspected by its owning client', function (): void {
    $tokens = introspectTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $response = $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/introspect', [
            'token' => $tokens['refresh_token'],
            'token_type_hint' => 'refresh_token',
        ])->assertOk();

    $response->assertJsonPath('active', true)
        ->assertJsonPath('token_type', 'refresh_token')
        ->assertJsonPath('token_use', 'refresh')
        ->assertJsonPath('client_id', 'app-b');
});

it('rejects introspection requests when the client cannot authenticate', function (): void {
    $tokens = introspectTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:wrong-secret'))
        ->postJson('/introspect', [
            'token' => $tokens['access_token'],
        ])->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');
});

it('returns active false for an unknown token without leaking technical details', function (): void {
    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->postJson('/introspect', [
            'token' => 'not-a-real-token-'.Str::random(8),
        ])->assertOk()
        ->assertExactJson(['active' => false]);
});

it('emits a token_introspected audit event for each introspection request', function (): void {
    $tokens = introspectTokenSet('app-b', 'https://sso.timeh.my.id/app-b/auth/callback', 'app-b-secret');

    $this->withHeader('Authorization', 'Basic '.base64_encode('app-b:app-b-secret'))
        ->withHeader('X-Request-Id', 'req-introspect-success')
        ->postJson('/introspect', [
            'token' => $tokens['access_token'],
            'token_type_hint' => 'access_token',
        ])->assertOk();

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'token_introspected')
        ->where('request_id', 'req-introspect-success')
        ->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-b')
        ->and($event->context['introspection_active'] ?? null)->toBeTrue()
        ->and($event->context['token_hash'] ?? null)->toBe(hash('sha256', $tokens['access_token']));
});

it('discovery metadata advertises the introspection endpoint and supported auth methods', function (): void {
    $metadata = $this->getJson('/.well-known/openid-configuration')->assertOk()->json();

    expect($metadata['introspection_endpoint'] ?? null)
        ->toBe(rtrim((string) config('sso.base_url'), '/').'/introspect')
        ->and($metadata['introspection_endpoint_auth_methods_supported'] ?? null)
        ->toBe(['client_secret_basic', 'client_secret_post']);
});

/**
 * @return array{access_token: string, id_token: string, refresh_token: string}
 */
function introspectTokenSet(string $clientId, string $redirectUri, ?string $clientSecret = null): array
{
    [$user, $sessionId] = introspectBrowserSessionUser();
    [$verifier, $challenge] = introspectPkcePair();

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

/**
 * @return array{0: User, 1: string}
 */
function introspectBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'introspect-'.Str::random(12).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'IntrospectionContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function introspectPkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
