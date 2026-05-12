<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');

    config()->set('oidc_clients.clients', [
        'app-a' => [
            'type' => 'public',
            'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        ],
        'app-b' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('app-b-secret'),
            'redirect_uris' => ['https://sso.timeh.my.id/app-b/auth/callback'],
            'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-b'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
        ],
    ]);
});

it('records accepted authorization requests without leaking state nonce or redirect uri', function (): void {
    [$user, $sessionId] = issue80LoggedInUser('issue80-accepted@example.test');
    [, $challenge] = issue80PkcePair();
    $state = 'state-'.Str::random(24);
    $nonce = 'nonce-'.Str::random(24);
    $redirectUri = 'https://sso.timeh.my.id/app-a/auth/callback';

    issue80AuthorizeWithBrowserSession($this, $user, $sessionId, [
        'client_id' => 'app-a',
        'redirect_uri' => $redirectUri,
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
    ])->assertRedirect();

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_accepted')
        ->firstOrFail();
    $encodedContext = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-a')
        ->and($event->subject_id)->toBe($user->subject_id)
        ->and($event->session_id)->not->toBeNull()
        ->and($event->ip_address)->toBe('203.0.113.80')
        ->and($event->user_agent)->toBe('Issue80AuthorizeAgent/1.0')
        ->and($event->request_id)->toBe('req-authorize-accepted-80')
        ->and($event->error_code)->toBeNull()
        ->and($event->context)->toMatchArray([
            'decision' => 'local_session',
            'client_type' => 'public',
            'scope' => 'openid profile email offline_access',
            'response_type' => 'code',
            'code_challenge_method' => 'S256',
        ])
        ->and($event->context['state_hash'] ?? null)->toBe(hash('sha256', $state))
        ->and($event->context['nonce_hash'] ?? null)->toBe(hash('sha256', $nonce))
        ->and($event->context['redirect_uri_hash'] ?? null)->toBe(hash('sha256', $redirectUri))
        ->and($encodedContext)->not->toContain($state)
        ->and($encodedContext)->not->toContain($nonce)
        ->and($encodedContext)->not->toContain($redirectUri)
        ->and($encodedContext)->not->toContain($challenge);
});

it('records rejected authorization requests with safe protocol context', function (): void {
    [, $challenge] = issue80PkcePair();
    $state = 'state-'.Str::random(24);
    $nonce = 'nonce-'.Str::random(24);
    $redirectUri = 'https://sso.timeh.my.id/app-a/auth/callback';

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.81'])
        ->withHeader('User-Agent', 'Issue80AuthorizeAgent/2.0')
        ->withHeader('X-Request-Id', 'req-authorize-rejected-80')
        ->get('/authorize?'.http_build_query([
            'client_id' => 'app-a',
            'redirect_uri' => $redirectUri,
            'response_type' => 'token',
            'scope' => 'openid profile email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]))->assertStatus(400)
        ->assertJsonPath('error', 'invalid_request');

    $event = AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_rejected')
        ->firstOrFail();
    $encodedContext = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('failed')
        ->and($event->client_id)->toBe('app-a')
        ->and($event->subject_id)->toBeNull()
        ->and($event->session_id)->toBeNull()
        ->and($event->ip_address)->toBe('203.0.113.81')
        ->and($event->user_agent)->toBe('Issue80AuthorizeAgent/2.0')
        ->and($event->request_id)->toBe('req-authorize-rejected-80')
        ->and($event->error_code)->toBe('unsupported_response_type')
        ->and($event->context)->toMatchArray([
            'decision' => 'rejected',
            'error_code' => 'unsupported_response_type',
            'client_type' => 'public',
            'scope' => 'openid profile email',
            'response_type' => 'token',
            'code_challenge_method' => 'S256',
        ])
        ->and($event->context['state_hash'] ?? null)->toBe(hash('sha256', $state))
        ->and($event->context['nonce_hash'] ?? null)->toBe(hash('sha256', $nonce))
        ->and($event->context['redirect_uri_hash'] ?? null)->toBe(hash('sha256', $redirectUri))
        ->and($encodedContext)->not->toContain($state)
        ->and($encodedContext)->not->toContain($nonce)
        ->and($encodedContext)->not->toContain($redirectUri)
        ->and($encodedContext)->not->toContain($challenge);
});

/**
 * @return array{0: User, 1: string}
 */
function issue80LoggedInUser(string $email): array
{
    $user = User::factory()->create(['email' => $email]);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AuthorizationRequestAuditContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function issue80PkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}

/**
 * @param  array<string, string|null>  $parameters
 */
function issue80AuthorizeWithBrowserSession(mixed $test, User $user, string $sessionId, array $parameters): TestResponse
{
    $query = array_filter([
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'code_challenge_method' => 'S256',
        ...$parameters,
    ], static fn (?string $value): bool => $value !== null);

    return $test
        ->withServerVariables(['REMOTE_ADDR' => '203.0.113.80'])
        ->withHeader('User-Agent', 'Issue80AuthorizeAgent/1.0')
        ->withHeader('X-Request-Id', 'req-authorize-accepted-80')
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query($query));
}
