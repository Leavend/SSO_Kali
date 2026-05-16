<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\User;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\ScopeSet;
use Illuminate\Support\Facades\Hash;

/**
 * BE-FR027-001 — prompt=none consent semantics MUST follow OIDC Core.
 *
 * FR/UC: FR-027, FR-028 / UC-15, UC-21.
 *
 * OpenID Connect Core 1.0 §3.1.2.1:
 *   - prompt=none MUST NOT cause any UI to be displayed.
 *   - End-User not authenticated → login_required.
 *   - Consent required and not present → consent_required.
 *   - prompt=none MUST NOT be combined with any other prompt value.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'fr027-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr027.test/callback'],
            'post_logout_redirect_uris' => ['https://fr027.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => false,
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();

    $this->user = User::factory()->create([
        'subject_id' => 'fr027-user',
        'subject_uuid' => 'fr027-user',
        'email' => 'fr027@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

function fr027AuthorizeQuery(array $overrides = []): array
{
    return array_merge([
        'client_id' => 'fr027-app',
        'redirect_uri' => 'https://fr027.test/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr027-state',
        'nonce' => 'fr027-nonce',
        'prompt' => 'none',
    ], $overrides);
}

function fr027BrowserSessionPayload(string $subjectId): array
{
    return [
        'sso_browser_session' => [
            'subject_id' => $subjectId,
            'session_id' => 'fr027-browser-session',
            'auth_time' => time(),
            'amr' => ['pwd'],
            'acr' => 'urn:sso:loa:basic',
        ],
    ];
}

it('returns login_required when prompt=none and no active session', function (): void {
    $response = $this->get('/authorize?'.http_build_query(fr027AuthorizeQuery([
        'state' => 'fr027-no-session',
    ])));

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)->toContain('error=login_required');
});

it('returns consent_required when prompt=none and authenticated but consent missing', function (): void {
    $response = $this->withSession(fr027BrowserSessionPayload($this->user->subject_id))
        ->get('/authorize?'.http_build_query(fr027AuthorizeQuery([
            'state' => 'fr027-needs-consent',
        ])));

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)->toStartWith('https://fr027.test/callback')
        ->and($location)->toContain('error=consent_required')
        ->and($location)->toContain('state=fr027-needs-consent')
        ->and($location)->not->toContain('/auth/consent');

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_rejected')
        ->where('error_code', 'consent_required')
        ->exists())->toBeTrue();
});

it('issues a code when prompt=none and prior consent exists', function (): void {
    app(ConsentService::class)->grant(
        $this->user->subject_id,
        'fr027-app',
        ScopeSet::fromString('openid profile email'),
    );

    $response = $this->withSession(fr027BrowserSessionPayload($this->user->subject_id))
        ->get('/authorize?'.http_build_query(fr027AuthorizeQuery([
            'state' => 'fr027-prior-consent',
        ])));

    $response->assertRedirect();
    $location = (string) $response->headers->get('Location');

    expect($location)->toStartWith('https://fr027.test/callback')
        ->and($location)->toContain('code=')
        ->and($location)->toContain('state=fr027-prior-consent')
        ->and($location)->not->toContain('error=');
});

it('rejects prompt=none combined with other prompt values', function (): void {
    $response = $this->get('/authorize?'.http_build_query(fr027AuthorizeQuery([
        'prompt' => 'none login',
    ])));

    // Combining "none" with any other value is forbidden by OIDC Core §3.1.2.1.
    // Either return invalid_request as JSON 400 or as a redirect with
    // error=invalid_request to the client redirect URI. We accept either.
    if ($response->isRedirect()) {
        $location = (string) $response->headers->get('Location');
        expect($location)->toContain('error=invalid_request');
    } else {
        $response->assertStatus(400);
        expect($response->json('error'))->toBe('invalid_request');
    }
});
