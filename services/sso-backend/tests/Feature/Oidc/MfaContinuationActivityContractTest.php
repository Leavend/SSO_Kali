<?php

declare(strict_types=1);

use App\Actions\Oidc\CompletePendingOidcAuthorization;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\OidcContinuationOutcome;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The MFA-continuation issuance path is the third place an authorization code is
 * minted (alongside /authorize and consent). Completing it is deliberate SSO
 * usage, so it must record activity on the bound session — keeping parity with
 * the other two issuance points and preventing premature idle expiry.
 */
beforeEach(function (): void {
    config()->set('sso.session.idle_minutes', 30);
    config()->set('oidc_clients.clients', [
        'continuation-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://continuation.test/callback'],
            'post_logout_redirect_uris' => ['https://continuation.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'publik',
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();
});

it('refreshes the bound session activity when the MFA continuation issues a code', function (): void {
    $user = User::factory()->create(['subject_id' => 'continuation-user']);

    $sessionId = (string) Str::uuid();
    $session = SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now()->subMinutes(40),
        'last_seen_at' => now()->subMinutes(40),
        // Stale activity (idle window 30m) but still absolutely valid.
        'activity_seen_at' => now()->subMinutes(40),
        'expires_at' => now()->addHours(4),
    ]);

    $context = [
        'client_id' => 'continuation-app',
        'redirect_uri' => 'https://continuation.test/callback',
        'code_challenge' => 'a'.str_repeat('B', 42),
        'code_challenge_method' => 'S256',
        'state' => 'continuation-state',
        'nonce' => 'continuation-nonce',
        'scope' => 'openid profile',
    ];

    $result = app(CompletePendingOidcAuthorization::class)->execute(
        $user,
        $context,
        $sessionId,
        Request::create('/api/mfa/challenge/verify', 'POST'),
    );

    expect($result->outcome)->toBe(OidcContinuationOutcome::AuthorizationCode);

    $session->refresh();
    expect($session->revoked_at)->toBeNull()
        ->and($session->activity_seen_at->greaterThan(now()->subMinute()))->toBeTrue();
});
