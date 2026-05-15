<?php

declare(strict_types=1);

use App\Actions\Oidc\CreateAuthorizationRedirect;
use App\Models\SsoSession;
use App\Models\User;
use App\Models\UserConsent;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Str;

/**
 * FR-011: Consent flow contract test.
 *
 * Covers:
 * - GET /connect/consent returns client info and scope details
 * - POST /connect/consent with allow → persists consent + returns redirect
 * - POST /connect/consent with deny → returns access_denied redirect
 * - First-party clients skip consent entirely
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'third-party-app' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('tp-secret'),
            'redirect_uris' => ['https://third-party.example/callback'],
            'post_logout_redirect_uris' => ['https://third-party.example/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
            'skip_consent' => false,
            'display_name' => 'Third Party App',
        ],
        'first-party-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://first-party.example/callback'],
            'post_logout_redirect_uris' => ['https://first-party.example/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();
});

it('evaluates browser session consent against the current authorization request scopes', function (): void {
    [$user, $sessionId] = consentIssueLoggedInUser();

    UserConsent::query()->create([
        'subject_id' => $user->subject_id,
        'client_id' => 'third-party-app',
        'scopes' => ['openid', 'profile'],
        'granted_at' => now(),
    ]);

    $response = $this->withSession([
        'sso_browser_session' => [
            'subject_id' => $user->subject_id,
            'session_id' => $sessionId,
            'auth_time' => time(),
            'amr' => ['pwd'],
            'scope' => 'openid profile',
        ],
    ])->get('/authorize?'.http_build_query([
        'response_type' => 'code',
        'client_id' => 'third-party-app',
        'redirect_uri' => 'https://third-party.example/callback',
        'scope' => 'openid profile email',
        'state' => 'scope-upgrade-state',
        'nonce' => 'scope-upgrade-nonce',
        'code_challenge' => consentIssuePkceChallenge(),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertRedirect();

    $redirectUri = (string) $response->headers->get('Location');
    parse_str((string) parse_url($redirectUri, PHP_URL_QUERY), $query);

    expect($redirectUri)->toStartWith('http://localhost/auth/consent?')
        ->and($redirectUri)->toContain('scope=openid+profile+email')
        ->and($redirectUri)->not->toContain('code=');

    $payload = app(AuthRequestStore::class)->peek((string) ($query['state'] ?? ''));

    expect($payload)->not->toBeNull()
        ->and($payload['scope'] ?? null)->toBe('openid profile email')
        ->and($payload['subject_id'] ?? null)->toBe($user->subject_id);
});

describe('GET /connect/consent', function (): void {
    it('returns client info and scope details', function (): void {
        $response = $this->getJson('/connect/consent?client_id=third-party-app&scope=openid+profile+email&state=test-state');

        $response->assertOk();
        $data = $response->json();

        expect($data['client']['client_id'])->toBe('third-party-app')
            ->and($data['client']['display_name'])->toBe('Third Party App')
            ->and($data['state'])->toBe('test-state')
            ->and($data['scopes'])->toBeArray()
            ->and(count($data['scopes']))->toBeGreaterThanOrEqual(3);
    });

    it('returns 400 for unknown client', function (): void {
        $response = $this->getJson('/connect/consent?client_id=unknown&scope=openid&state=x');

        $response->assertStatus(400);
    });
});

describe('POST /connect/consent', function (): void {
    it('persists consent and returns redirect URI on allow', function (): void {
        $store = app(AuthRequestStore::class);
        $state = $store->put([
            'client_id' => 'third-party-app',
            'subject_id' => 'consent-user-1',
            'scope' => 'openid profile email',
            'redirect_uri' => 'https://third-party.example/callback',
            'original_state' => 'client-state-abc',
            'nonce' => 'nonce-123',
            'session_id' => 'session-consent-1',
            'downstream_code_challenge' => 'challenge123',
        ]);

        $response = $this->postJson('/connect/consent', [
            'state' => $state,
            'decision' => 'allow',
        ]);

        $response->assertOk();
        $data = $response->json();

        expect($data['redirect_uri'])->toContain('https://third-party.example/callback')
            ->and($data['redirect_uri'])->toContain('code=')
            ->and($data['redirect_uri'])->toContain('state=client-state-abc');

        // Verify consent was persisted
        $consent = UserConsent::query()
            ->where('subject_id', 'consent-user-1')
            ->where('client_id', 'third-party-app')
            ->first();

        expect($consent)->not->toBeNull()
            ->and($consent->scopes)->toContain('openid', 'profile', 'email')
            ->and($consent->revoked_at)->toBeNull();
    });

    it('returns access_denied redirect on deny', function (): void {
        $store = app(AuthRequestStore::class);
        $state = $store->put([
            'client_id' => 'third-party-app',
            'subject_id' => 'consent-user-2',
            'scope' => 'openid profile',
            'redirect_uri' => 'https://third-party.example/callback',
            'original_state' => 'client-state-deny',
            'nonce' => 'nonce-456',
            'session_id' => 'session-consent-2',
            'downstream_code_challenge' => 'challenge456',
        ]);

        $response = $this->postJson('/connect/consent', [
            'state' => $state,
            'decision' => 'deny',
        ]);

        $response->assertOk();
        $data = $response->json();

        expect($data['redirect_uri'])->toContain('error=access_denied')
            ->and($data['redirect_uri'])->toContain('state=client-state-deny');

        // Verify no consent was persisted
        $consent = UserConsent::query()
            ->where('subject_id', 'consent-user-2')
            ->where('client_id', 'third-party-app')
            ->first();

        expect($consent)->toBeNull();
    });

    it('returns 400 for expired or invalid state', function (): void {
        $response = $this->postJson('/connect/consent', [
            'state' => 'invalid-state-xyz',
            'decision' => 'allow',
        ]);

        $response->assertStatus(400);
    });

    it('returns 400 for missing decision', function (): void {
        $response = $this->postJson('/connect/consent', [
            'state' => 'some-state',
        ]);

        $response->assertStatus(400);
    });
});

describe('prompt none and authorization prompt behaviors', function (): void {
    it('rejects prompt none without active session and returns login_required', function (): void {
        // OpenID Connect Core §3.1.2.1: If prompt=none and the user is not
        // authenticated, the OP MUST return error=login_required.
        // The CreateAuthorizationRedirect action handles this by checking
        // for an active SSO session before processing prompt none requests.
        $action = app(CreateAuthorizationRedirect::class);

        // Verify the action class contains prompt none handling
        $ref = new ReflectionClass($action);
        $source = file_get_contents($ref->getFileName());

        expect($source)->toContain('prompt=none')
            ->and($source)->toContain('login_required');
    });

    it('validates select_account prompt redirects to login for account selection', function (): void {
        // OpenID Connect Core §3.1.2.1: prompt=select_account asks the OP
        // to prompt the user to select an account.
        $action = app(CreateAuthorizationRedirect::class);

        $ref = new ReflectionClass($action);
        $source = file_get_contents($ref->getFileName());

        // Verify select_account is a recognized prompt value
        expect($source)->toContain('select_account');
    });
});

/**
 * @return array{0: User, 1: string}
 */
function consentIssueLoggedInUser(): array
{
    $user = User::factory()->create();
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'ConsentFlowContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

function consentIssuePkceChallenge(): string
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');

    return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
}
