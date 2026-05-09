<?php

declare(strict_types=1);

use App\Actions\Oidc\ValidateProductionOidcClientRegistryAction;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

function productionClientVerifier(): string
{
    return rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
}

function productionClientChallenge(string $verifier): string
{
    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    $secretHash = app(ClientSecretHashPolicy::class)->make('app-b-secret');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => $secretHash,
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
        ],
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id'],
            'backchannel_logout_uri' => 'https://api-sso.timeh.my.id/connect/backchannel/admin-panel/logout',
        ],
    ]);
});

it('validates the production oidc client registry', function (): void {
    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeTrue()
        ->and($result['checked_clients'])->toBe(3)
        ->and($result['checked_confidential_clients'])->toBe(1)
        ->and($result['errors'])->toBe([]);
});

it('rejects production client registries containing localhost redirects', function (): void {
    $clients = config('oidc_clients.clients');
    $clients['app-a']['redirect_uris'] = ['http://localhost:3000/callback'];
    config()->set('oidc_clients.clients', $clients);
    app(DownstreamClientRegistry::class)->flush();

    $result = app(ValidateProductionOidcClientRegistryAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and(implode(' ', $result['errors']))->toContain('localhost');
});

it('completes App A public PKCE authorization code flow with state and userinfo parity', function (): void {
    $user = User::factory()->create([
        'email' => 'app-a-user@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $login = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
    expect($sessionId)->not->toBe('');

    $verifier = productionClientVerifier();
    $state = 'state-'.Str::random(16);
    $nonce = 'nonce-'.Str::random(16);

    $authorizeResponse = $this
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
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => productionClientChallenge($verifier),
            'code_challenge_method' => 'S256',
        ]));

    $authorizeResponse->assertRedirect();

    $location = (string) $authorizeResponse->headers->get('Location');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $callbackQuery);

    expect($location)->toStartWith('https://sso.timeh.my.id/app-a/auth/callback')
        ->and($callbackQuery['state'] ?? null)->toBe($state)
        ->and($callbackQuery['code'] ?? null)->toBeString()->not->toBe('');

    $tokenResponse = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code_verifier' => $verifier,
        'code' => (string) $callbackQuery['code'],
    ])->assertOk()
        ->assertJsonStructure(['token_type', 'expires_in', 'access_token', 'id_token', 'refresh_token']);
});

it('enforces App B confidential client secret during token exchange', function (): void {
    $user = User::factory()->create([
        'email' => 'app-b-user@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
    $verifier = productionClientVerifier();

    $authorizeResponse = $this
        ->withSession([
            'broker_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => 'app-b',
            'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access',
            'state' => 'state-'.Str::random(16),
            'nonce' => 'nonce-'.Str::random(16),
            'code_challenge' => productionClientChallenge($verifier),
            'code_challenge_method' => 'S256',
        ]));

    $authorizeResponse->assertRedirect();
    parse_str((string) parse_url((string) $authorizeResponse->headers->get('Location'), PHP_URL_QUERY), $callbackQuery);

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-b',
        'redirect_uri' => 'https://sso.timeh.my.id/app-b/auth/callback',
        'code_verifier' => $verifier,
        'code' => (string) $callbackQuery['code'],
    ])->assertStatus(401);
});
