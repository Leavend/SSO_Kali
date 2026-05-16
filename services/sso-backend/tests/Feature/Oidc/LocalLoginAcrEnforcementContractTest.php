<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;

/**
 * BE-FR021-001 — Step-up acr_values MUST be enforced through the local login path.
 *
 * FR/UC: FR-021 / UC-14, UC-19, UC-67, UC-68, UC-72.
 *
 * If a relying party requests acr_values=urn:sso:loa:mfa, password-only
 * authentication MUST NOT yield an authorization code. Instead:
 *   - Enrolled user → MFA challenge MUST be issued (existing path).
 *   - Non-enrolled user → MUST be rejected with mfa_enrollment_required;
 *     no code issued, no scope downgrade. The frontend can surface the
 *     enrolment prompt safely.
 *
 * Without explicit acr_values, password-only success is allowed and the
 * issued code carries acr=urn:sso:loa:password.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'fr021-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr021.test/callback'],
            'post_logout_redirect_uris' => ['https://fr021.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();

    $this->user = User::factory()->create([
        'subject_id' => 'fr021-user',
        'subject_uuid' => 'fr021-user',
        'email' => 'fr021@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

afterEach(function (): void {
    app(LoginAttemptThrottle::class)->clear('fr021@example.com');
});

function fr021LocalLogin(array $overrides = []): array
{
    return array_merge([
        'email' => 'fr021@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'fr021-app',
        'redirect_uri' => 'https://fr021.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr021-state',
        'nonce' => 'fr021-nonce',
        'scope' => 'openid profile email',
    ], $overrides);
}

it('rejects password-only login when acr_values=urn:sso:loa:mfa and user has no MFA', function (): void {
    $response = $this->postJson('/connect/local-login', fr021LocalLogin([
        'acr_values' => 'urn:sso:loa:mfa',
    ]));

    // OIDC RFC: when requested ACR cannot be satisfied, no code MUST be
    // issued and the OP MUST NOT silently downgrade. The user is asked
    // to enrol MFA before this RP can grant the requested LoA.
    $response->assertStatus(403)
        ->assertJsonPath('error', 'mfa_enrollment_required');

    expect($response->json('redirect_uri'))->toBeNull();

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'authorization_request_rejected')
        ->where('error_code', 'mfa_enrollment_required')
        ->where('client_id', 'fr021-app')
        ->exists())->toBeTrue();
});

it('forces MFA challenge when acr_values=urn:sso:loa:mfa and user has MFA enrolled', function (): void {
    MfaCredential::factory()->verified()->create([
        'user_id' => $this->user->getKey(),
    ]);

    $response = $this->postJson('/connect/local-login', fr021LocalLogin([
        'acr_values' => 'urn:sso:loa:mfa',
    ]));

    $response->assertOk();
    $data = $response->json();

    expect($data['mfa_required'] ?? null)->toBeTrue()
        ->and($data['challenge']['challenge_id'] ?? null)->toBeString()
        ->and($data['redirect_uri'] ?? null)->toBeNull();
});

it('issues a password-level code when no acr_values is requested', function (): void {
    $response = $this->postJson('/connect/local-login', fr021LocalLogin());

    $response->assertOk();
    $data = $response->json();

    expect($data['redirect_uri'])->toContain('code=')
        ->and($data['redirect_uri'])->toContain('state=fr021-state')
        ->and($data['mfa_required'] ?? false)->toBeFalse();
});

it('treats unknown acr_values as no requirement and allows password code', function (): void {
    // Defensive: unknown ACR values are permissive in AcrEvaluator
    // (level 0). Local login MUST mirror that behavior.
    $response = $this->postJson('/connect/local-login', fr021LocalLogin([
        'acr_values' => 'urn:sso:loa:bogus',
    ]));

    $response->assertOk();
    expect($response->json('redirect_uri'))->toContain('code=');
});
