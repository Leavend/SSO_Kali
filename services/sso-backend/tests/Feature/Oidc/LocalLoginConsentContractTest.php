<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'third-party-consent-app' => [
            'type' => 'public',
            'display_name' => 'Third Party Consent App',
            'redirect_uris' => ['https://third-party.test/callback'],
            'post_logout_redirect_uris' => ['https://third-party.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => false,
        ],
    ]);
    config()->set('sso.frontend_url', 'https://sso.test');

    app(DownstreamClientRegistry::class)->flush();

    User::factory()->create([
        'subject_id' => 'consent-user-1',
        'subject_uuid' => 'consent-user-1',
        'email' => 'consent-user@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('consent-user@example.com');
});

it('does not auto grant consent or issue a code for a non first party local login', function (): void {
    $response = $this->postJson('/connect/local-login', localLoginConsentPayload('consent-state-1'));

    $response->assertOk();

    $redirectUri = (string) $response->json('redirect_uri');

    expect($redirectUri)->toStartWith('https://sso.test/auth/consent?')
        ->and($redirectUri)->toContain('client_id=third-party-consent-app')
        ->and($redirectUri)->toContain('state=')
        ->and($redirectUri)->not->toContain('code=');

    expect(DB::table('user_consents')->where('client_id', 'third-party-consent-app')->exists())->toBeFalse();
});

it('issues an authorization code only after explicit consent approval and audits the decision', function (): void {
    $login = $this->postJson('/connect/local-login', localLoginConsentPayload('consent-state-approve'));
    $consentState = consentStateFromRedirect((string) $login->json('redirect_uri'));

    $response = $this->postJson('/connect/consent', [
        'state' => $consentState,
        'decision' => 'allow',
    ]);

    $response->assertOk();

    $redirectUri = (string) $response->json('redirect_uri');

    expect($redirectUri)->toStartWith('https://third-party.test/callback?')
        ->and($redirectUri)->toContain('code=')
        ->and($redirectUri)->toContain('state=consent-state-approve');

    expect(DB::table('user_consents')->where('client_id', 'third-party-consent-app')->exists())->toBeTrue();

    $event = DB::table('authentication_audit_events')
        ->where('event_type', 'consent_decision')
        ->where('client_id', 'third-party-consent-app')
        ->latest('id')
        ->first();

    expect($event)->not->toBeNull()
        ->and($event->outcome)->toBe('succeeded')
        ->and($event->subject_id)->toBe('consent-user-1');
});

it('returns a safe OAuth error redirect when consent is denied and audits the denial', function (): void {
    $login = $this->postJson('/connect/local-login', localLoginConsentPayload('consent-state-deny'));
    $consentState = consentStateFromRedirect((string) $login->json('redirect_uri'));

    $response = $this->postJson('/connect/consent', [
        'state' => $consentState,
        'decision' => 'deny',
    ]);

    $response->assertOk();

    $redirectUri = (string) $response->json('redirect_uri');

    expect($redirectUri)->toStartWith('https://third-party.test/callback?')
        ->and($redirectUri)->toContain('error=access_denied')
        ->and($redirectUri)->toContain('state=consent-state-deny')
        ->and($redirectUri)->not->toContain('code=');

    $event = DB::table('authentication_audit_events')
        ->where('event_type', 'consent_decision')
        ->where('client_id', 'third-party-consent-app')
        ->latest('id')
        ->first();

    expect($event)->not->toBeNull()
        ->and($event->outcome)->toBe('failed')
        ->and($event->error_code)->toBe('access_denied');
});

/**
 * @return array<string, string>
 */
function localLoginConsentPayload(string $state): array
{
    return [
        'email' => 'consent-user@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'third-party-consent-app',
        'redirect_uri' => 'https://third-party.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => $state,
        'nonce' => 'nonce-consent',
        'scope' => 'openid profile email',
    ];
}

function consentStateFromRedirect(string $redirectUri): string
{
    parse_str((string) parse_url($redirectUri, PHP_URL_QUERY), $query);

    return (string) ($query['state'] ?? '');
}
