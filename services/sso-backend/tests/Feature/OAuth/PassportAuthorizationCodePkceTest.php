<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Database\Seeders\PassportClientSeeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('sso.admin.panel_redirect_uri', 'http://localhost:3000/auth/callback');
    $this->seed(PassportClientSeeder::class);
});

function pkceVerifier(): string
{
    return rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
}

function pkceChallenge(string $verifier): string
{
    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}

it('redirects unauthenticated authorize requests to Vue login with a safe return_to URL', function (): void {
    config()->set('sso.login_url', 'http://localhost:3000/login');

    $params = [
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'state-123',
        'code_challenge' => pkceChallenge(pkceVerifier()),
        'code_challenge_method' => 'S256',
    ];

    $response = $this->get('/oauth/authorize?'.http_build_query($params));

    $response->assertRedirect('http://localhost/login');

    $bridgeResponse = $this->withSession([
        'url.intended' => 'http://localhost/oauth/authorize?'.http_build_query($params),
    ])->get('/login');

    $bridgeResponse->assertRedirect();

    $location = (string) $bridgeResponse->headers->get('Location');
    expect($location)->toStartWith('http://localhost:3000/login?return_to=');

    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
    expect(urldecode((string) $query['return_to']))
        ->toContain('/oauth/authorize')
        ->toContain('client_id=sso-admin-panel')
        ->toContain('state=state-123');
});

it('does not forward external return_to values to Vue login', function (): void {
    config()->set('sso.login_url', 'http://localhost:3000/login');

    $response = $this->get('/login?return_to=https://evil.example/oauth/authorize');

    $response->assertRedirect();

    $location = (string) $response->headers->get('Location');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    expect(urldecode((string) $query['return_to']))->toBe('http://localhost/oauth/authorize');
});

it('completes Passport Authorization Code with PKCE using the native SSO cookie', function (): void {
    $user = User::factory()->create([
        'email' => 'oauth-admin@example.test',
        'password' => Hash::make('correct-password'),
        'role' => 'admin',
    ]);

    $login = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
    expect($sessionId)->not->toBe('');

    $verifier = pkceVerifier();
    $state = 'state-'.Str::random(16);

    $authorizeParams = [
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => $state,
        'code_challenge' => pkceChallenge($verifier),
        'code_challenge_method' => 'S256',
    ];

    $authorizeResponse = $this
        ->withHeader('Cookie', config('sso.session.cookie', 'sso_session').'='.$sessionId)
        ->get('/oauth/authorize?'.http_build_query($authorizeParams));

    $authorizeResponse->assertRedirect();

    $location = (string) $authorizeResponse->headers->get('Location');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $callbackQuery);

    expect($location)->toStartWith('http://localhost:3000/auth/callback')
        ->and($callbackQuery['state'] ?? null)->toBe($state)
        ->and($callbackQuery['code'] ?? null)->toBeString()->not->toBe('');

    $tokenResponse = $this->postJson('/oauth/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
        'code_verifier' => $verifier,
        'code' => (string) $callbackQuery['code'],
    ]);

    $tokenResponse->assertOk()
        ->assertJsonStructure([
            'token_type',
            'expires_in',
            'access_token',
            'refresh_token',
        ]);

    $accessToken = (string) $tokenResponse->json('access_token');

    $this->withToken($accessToken)
        ->getJson('/userinfo')
        ->assertOk()
        ->assertJsonPath('sub', $user->subject_id)
        ->assertJsonPath('email', $user->email);
});
