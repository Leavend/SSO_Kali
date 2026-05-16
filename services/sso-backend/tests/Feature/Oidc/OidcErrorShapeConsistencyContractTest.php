<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * BE-FR028-001 — OIDC error response shape consistency.
 *
 * FR/UC: FR-028 / UC-15, UC-16, UC-17, UC-21.
 *
 * Acceptance criteria locked here:
 *   1. Protocol JSON errors (/connect/local-login, /connect/consent) carry
 *      both `error` and `error_description`.
 *   2. JSON error responses include Cache-Control: no-store and
 *      Pragma: no-cache headers.
 *   3. Redirect-style errors (e.g. /authorize when registry already
 *      validated the redirect_uri) preserve `state` from the request.
 *   4. No raw exception trace is rendered in any FR-023..FR-028 path.
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.debug', false);
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    config()->set('oidc_clients.clients', [
        'fr028-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/fr028/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/fr028'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
        ],
        'fr028-conf' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('fr028-conf-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/fr028-conf/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/fr028-conf'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
        ],
    ]);
});

it('returns consistent error shape for /connect/local-login bad credentials', function (): void {
    User::factory()->create([
        'email' => 'fr028-bad-creds@example.test',
        'password' => Hash::make('Correct123!'),
        'password_changed_at' => now(),
    ]);

    $response = $this->postJson('/connect/local-login', [
        'email' => 'fr028-bad-creds@example.test',
        'password' => 'Wrong123!',
        'client_id' => 'fr028-app',
        'redirect_uri' => 'https://sso.timeh.my.id/fr028/auth/callback',
        'code_challenge' => fr028Challenge(),
        'code_challenge_method' => 'S256',
        'state' => 'state-'.Str::random(16),
        'nonce' => 'nonce-'.Str::random(16),
        'scope' => 'openid profile email',
    ])->assertStatus(401);

    expect($response->json('error'))->toBe('invalid_credentials')
        ->and($response->json('error_description'))->toBeString()->not->toBe('')
        ->and((string) $response->headers->get('Cache-Control'))->toContain('no-store')
        ->and((string) $response->headers->get('Pragma'))->toContain('no-cache');

    fr028AssertNoTrace($response->getContent());
});

it('returns consistent error shape for /connect/local-login invalid client', function (): void {
    $response = $this->postJson('/connect/local-login', [
        'email' => 'irrelevant@example.test',
        'password' => 'irrelevant',
        'client_id' => 'fr028-not-registered',
        'redirect_uri' => 'https://sso.timeh.my.id/fr028/auth/callback',
        'code_challenge' => fr028Challenge(),
        'code_challenge_method' => 'S256',
        'state' => 'state-'.Str::random(16),
        'nonce' => 'nonce-'.Str::random(16),
        'scope' => 'openid',
    ])->assertStatus(400);

    expect($response->json('error'))->toBe('invalid_client')
        ->and($response->json('error_description'))->toBeString()->not->toBe('')
        ->and((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    fr028AssertNoTrace($response->getContent());
});

it('returns consistent error shape for GET /connect/consent unknown client', function (): void {
    $response = $this->getJson('/connect/consent?client_id=fr028-not-registered&scope=openid')
        ->assertStatus(400);

    expect($response->json('error'))->toBe('invalid_client')
        ->and($response->json('error_description'))->toBeString()->not->toBe('')
        ->and((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    fr028AssertNoTrace($response->getContent());
});

it('returns consistent error shape for POST /connect/consent invalid state', function (): void {
    $response = $this->postJson('/connect/consent', [
        'state' => 'unknown-or-expired',
        'decision' => 'allow',
    ])->assertStatus(400);

    expect($response->json('error'))->toBe('invalid_request')
        ->and($response->json('error_description'))->toBeString()->not->toBe('')
        ->and((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    fr028AssertNoTrace($response->getContent());
});

it('preserves state on /authorize redirect errors when redirect is registered', function (): void {
    $state = 'state-fr028-'.Str::random(16);

    // prompt=none with no session → redirect to client with login_required,
    // state preserved per OAuth 2.0 RFC 6749 §4.1.2.1.
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'fr028-app',
        'redirect_uri' => 'https://sso.timeh.my.id/fr028/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid',
        'state' => $state,
        'nonce' => 'nonce-'.Str::random(16),
        'code_challenge' => fr028Challenge(),
        'code_challenge_method' => 'S256',
        'prompt' => 'none',
    ]));

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    expect($query['state'] ?? null)->toBe($state)
        ->and($query['error'] ?? null)->toBe('login_required')
        ->and($query['error_description'] ?? null)->toBeString()->not->toBe('');
});

it('returns invalid_grant without leaking exception trace at /token', function (): void {
    $response = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'fr028-app',
        'refresh_token' => 'rt_unknown',
    ])->assertStatus(400);

    expect($response->json('error'))->toBe('invalid_grant')
        ->and($response->json('error_description'))->toBeString()->not->toBe('')
        ->and((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    fr028AssertNoTrace($response->getContent());
});

function fr028Challenge(): string
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');

    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}

function fr028AssertNoTrace(?string $body): void
{
    expect((string) $body)
        ->not->toContain('Stack trace')
        ->and((string) $body)->not->toContain('#0 /')
        ->and((string) $body)->not->toContain('vendor/laravel');
}
