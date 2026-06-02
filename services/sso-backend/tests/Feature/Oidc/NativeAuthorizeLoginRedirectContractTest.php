<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

beforeEach(function (): void {
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.engine', 'native');
    config()->set('sso.login_url', 'https://sso.timeh.my.id/login');
    config()->set('sso.admin.freshness.read_seconds', 28800);
    config()->set('oidc_clients.clients', [
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://admin-sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://admin-sso.timeh.my.id/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access', 'roles', 'permissions'],
            'skip_consent' => true,
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();
});

it('reuses a fresh browser session for admin panel authorize without forcing login', function (): void {
    [$user, $sessionId] = adminSingleLoginUser('admin-singlelogin-fresh@example.test');

    $response = adminSingleLoginAuthorize($this, $user, $sessionId, time() - 60);

    $response->assertRedirect();

    expect((string) $response->headers->get('Location'))
        ->toStartWith('https://admin-sso.timeh.my.id/auth/callback?code=')
        ->not->toContain('https://sso.timeh.my.id/login');
});

it('redirects a stale admin panel browser session to login for fresh auth', function (): void {
    [$user, $sessionId] = adminSingleLoginUser('admin-singlelogin-stale@example.test');

    $response = adminSingleLoginAuthorize($this, $user, $sessionId, time() - 28801);

    $response->assertRedirect();

    $location = (string) $response->headers->get('Location');

    expect($location)
        ->toStartWith('https://sso.timeh.my.id/login?')
        ->not->toContain('https://admin-sso.timeh.my.id/auth/callback?code=');
});

it('redirects unauthenticated native authorize requests to portal login instead of upstream Zitadel', function (): void {
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'https://admin-sso.timeh.my.id/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access roles permissions',
        'state' => 'state-admin-native-login',
        'nonce' => 'nonce-admin-native-login',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertRedirect();

    $location = (string) $response->headers->get('Location');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $loginQuery);
    $authRequestId = (string) ($loginQuery['auth_request_id'] ?? '');
    $context = app(AuthRequestStore::class)->pull($authRequestId);

    expect($location)->toStartWith('https://sso.timeh.my.id/login?')
        ->and($location)->not->toContain('/oauth/v2/authorize')
        ->and($location)->not->toContain('/callbacks/upstream')
        ->and($location)->not->toContain('client_id=&')
        ->and($location)->not->toContain('return_to=')
        ->and($authRequestId)->not->toBe('')
        ->and($authRequestId)->not->toContain('https://')
        ->and($context)->toBeArray()
        ->and($context['client_id'] ?? null)->toBe('sso-admin-panel')
        ->and($context['redirect_uri'] ?? null)->toBe('https://admin-sso.timeh.my.id/auth/callback')
        ->and($context['scope'] ?? null)->toBe('openid profile email offline_access roles permissions')
        ->and($context['nonce'] ?? null)->toBe('nonce-admin-native-login')
        ->and($context['original_state'] ?? null)->toBe('state-admin-native-login')
        ->and($context['downstream_code_challenge'] ?? null)->toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
        ->and($context['code_challenge_method'] ?? null)->toBe('S256');
});

/**
 * @return array{0: User, 1: string}
 */
function adminSingleLoginUser(string $email): array
{
    $user = User::factory()->create(['email' => $email]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AdminSingleLogin/1.0',
        'authenticated_at' => now()->subMinute(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function adminSingleLoginAuthorize(mixed $test, User $user, string $sessionId, int $authTime): TestResponse
{
    return $test
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => $authTime,
                'amr' => ['pwd'],
                'acr' => 'urn:sso:loa:password',
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => 'sso-admin-panel',
            'redirect_uri' => 'https://admin-sso.timeh.my.id/auth/callback',
            'response_type' => 'code',
            'scope' => 'openid profile email offline_access roles permissions',
            'state' => 'state-admin-singlelogin',
            'nonce' => 'nonce-admin-singlelogin',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
        ]));
}
