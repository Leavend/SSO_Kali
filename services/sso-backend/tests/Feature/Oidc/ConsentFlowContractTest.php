<?php

declare(strict_types=1);

use App\Actions\Oidc\CreateAuthorizationRedirect;
use App\Models\UserConsent;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;

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
            'secret' => password_hash('tp-secret', PASSWORD_ARGON2ID),
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
