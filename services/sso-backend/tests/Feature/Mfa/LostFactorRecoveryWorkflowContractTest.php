<?php

declare(strict_types=1);

namespace Tests\Feature\Mfa;

use App\Models\AdminAuditEvent;
use App\Models\MfaCredential;
use App\Models\Role;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\LowRecoveryCodesNotification;
use App\Notifications\MfaDisabledNotification;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Mfa\RecoveryCodeService;
use App\Services\Mfa\TotpService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use OTPHP\TOTP;

uses(RefreshDatabase::class);

/**
 * BE-FR020-001 — Lost-factor MFA recovery workflow end-to-end contract.
 *
 * Acceptance criteria locked here:
 *   1. A used recovery code cannot be reused after admin reset.
 *   2. Admin reset writes a structured admin audit event with the redacted
 *      reason and the actor's subject id.
 *   3. The reset triggers the disabled-by-admin notification.
 *   4. The reset user is forced into re-enrolment: every privileged
 *      endpoint returns `mfa_reenrollment_required` until the user
 *      completes a fresh TOTP enrolment.
 *   5. After re-enrolment, the gate clears and the user can proceed.
 */
beforeEach(function (): void {
    $this->seed(RbacSeeder::class);

    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.freshness.read_seconds', 900);
    config()->set('sso.admin.freshness.step_up_seconds', 300);
    config()->set('sso.admin.mfa.enforced', true);
    config()->set('sso.admin.mfa.accepted_amr', ['mfa']);
    config()->set('sso.admin.mfa.grace_period_hours', 72);
});

function fr020Admin(): User
{
    return User::query()->create([
        'subject_id' => 'fr020-admin-'.Str::random(8),
        'subject_uuid' => (string) Str::uuid(),
        'email' => 'admin-'.Str::lower(Str::random(6)).'@fr020.test',
        'password' => Hash::make('SecureAdminPass123!'),
        'display_name' => 'FR020 Admin',
        'given_name' => 'FR020',
        'role' => 'admin',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);
}

function fr020User(): User
{
    return User::query()->create([
        'subject_id' => 'fr020-user-'.Str::random(8),
        'subject_uuid' => (string) Str::uuid(),
        'email' => 'user-'.Str::lower(Str::random(6)).'@fr020.test',
        // The 'password' attribute uses the 'hashed' cast on User. Pass plain
        // text so the cast applies the configured Argon2id driver.
        'password' => 'SecureUserPass123!',
        'display_name' => 'FR020 User',
        'given_name' => 'FR020',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);
}

function fr020SessionCookieFor(User $user): string
{
    if ($role = Role::query()->where('slug', 'user')->first()) {
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    $sessionId = (string) Str::uuid();
    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addMinutes(60),
    ]);

    return $sessionId;
}

function fr020AdminToken(User $admin): string
{
    return (string) app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$admin->subject_id,
        'subject_id' => $admin->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ])['access_token'];
}

it('locks the lost-factor recovery flow end-to-end', function (): void {
    Notification::fake();

    $admin = fr020Admin();
    $user = fr020User();
    /** @var RecoveryCodeService $recoveryCodes */
    $recoveryCodes = app(RecoveryCodeService::class);
    /** @var TotpService $totpService */
    $totpService = app(TotpService::class);

    // --- Stage 1: user is fully enrolled with TOTP + recovery codes ---
    MfaCredential::factory()->totp()->verified()->create([
        'user_id' => $user->getKey(),
    ]);
    $codes = $recoveryCodes->generate($user->getKey());
    expect($codes)->toHaveCount(8);

    // --- Stage 2: user consumes one recovery code, then admin resets ---
    expect($recoveryCodes->verify($user->getKey(), $codes[0]))->toBeTrue();
    expect($recoveryCodes->remaining($user->getKey()))->toBe(7);

    $reason = 'Lost device confirmed via support call SR-'.Str::random(6);

    $adminToken = fr020AdminToken($admin);
    $reset = $this->withToken($adminToken)
        ->postJson("/admin/api/users/{$user->subject_id}/reset-mfa", [
            'reason' => $reason,
        ])
        ->assertOk();

    $reset->assertJsonPath('reset', true)
        ->assertJsonPath('reenrollment_required', true);

    // (a) used recovery code cannot be reused: the row was deleted on reset.
    expect($recoveryCodes->verify($user->getKey(), $codes[0]))->toBeFalse();
    // (b) every other code is also invalidated.
    foreach (array_slice($codes, 1) as $other) {
        expect($recoveryCodes->verify($user->getKey(), $other))->toBeFalse();
    }

    // (c) reset notification dispatched.
    Notification::assertSentTo($user, MfaDisabledNotification::class);

    // (d) admin audit event written with redacted reason + actor.
    $audit = AdminAuditEvent::query()
        ->where('action', 'emergency_mfa_reset')
        ->latest('id')
        ->first();
    expect($audit)->not->toBeNull();
    /** @var AdminAuditEvent $audit */
    expect($audit->admin_subject_id)->toBe($admin->subject_id);
    expect($audit->context)->toMatchArray([
        'target_subject_id' => $user->subject_id,
        'reason' => $reason,
    ]);

    // (e) user is now flagged for re-enrolment.
    $user->refresh();
    expect($user->mfa_reset_required)->toBeTrue();
    expect($user->mfa_reset_reason)->toBe($reason);

    // --- Stage 3: protected portal endpoints refuse until re-enrolled ---
    // The admin bearer token from the previous stage must NOT influence
    // the user-cookie path; clear it so we exercise the resolver via the
    // session credential alone.
    unset($this->defaultHeaders['Authorization']);

    $cookieName = config('sso.session.cookie');
    $sessionId = fr020SessionCookieFor($user);
    $cookieHeader = $cookieName.'='.$sessionId;

    $this->withHeader('Cookie', $cookieHeader)
        ->getJson('/api/profile')
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_reenrollment_required');

    $this->withHeader('Cookie', $cookieHeader)
        ->getJson('/api/profile/sessions')
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_reenrollment_required');

    // /api/mfa/status remains reachable so the SPA can show the banner.
    $status = $this->withHeader('Cookie', $cookieHeader)
        ->getJson('/api/mfa/status')
        ->assertOk();
    $status->assertJsonPath('reenrollment_required', true);
    $status->assertJsonPath('reset_reason', $reason);

    // /connect/local-login also blocks until re-enrolled (downstream OIDC).
    config()->set('oidc_clients.clients', [
        'fr020-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://fr020.test/callback'],
            'post_logout_redirect_uris' => ['https://fr020.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
        ],
    ]);
    app(DownstreamClientRegistry::class)->flush();

    $this->postJson('/connect/local-login', [
        'email' => $user->email,
        'password' => 'SecureUserPass123!',
        'client_id' => 'fr020-app',
        'redirect_uri' => 'https://fr020.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'fr020-state',
        'nonce' => 'fr020-nonce',
        'scope' => 'openid profile email',
    ])
        ->assertStatus(403)
        ->assertJsonPath('error', 'mfa_reenrollment_required');

    // --- Stage 4: user re-enrolls TOTP, gate clears ---
    $enroll = $this->withHeader('Cookie', $cookieHeader)
        ->postJson('/api/mfa/totp/enroll')
        ->assertSuccessful();
    $secret = (string) $enroll->json('secret');
    expect($secret)->not->toBe('');

    $totp = TOTP::createFromSecret($secret);
    $totp->setDigits(6);
    $totp->setPeriod(30);

    $verify = $this->withHeader('Cookie', $cookieHeader)
        ->postJson('/api/mfa/totp/verify', ['code' => $totp->now()])
        ->assertOk();
    expect($verify->json('recovery_codes'))->toBeArray()->toHaveCount(8);

    // After re-enrolment the gate clears.
    $user->refresh();
    expect($user->mfa_reset_required)->toBeFalse();

    $this->withHeader('Cookie', $cookieHeader)
        ->getJson('/api/profile')
        ->assertOk();

    $statusAfter = $this->withHeader('Cookie', $cookieHeader)
        ->getJson('/api/mfa/status')
        ->assertOk();
    $statusAfter->assertJsonPath('enrolled', true);
    $statusAfter->assertJsonPath('reenrollment_required', false);
});

it('low recovery-code notification fires when codes drop to threshold during MFA challenge', function (): void {
    Notification::fake();

    $user = fr020User();
    /** @var RecoveryCodeService $recoveryCodes */
    $recoveryCodes = app(RecoveryCodeService::class);

    MfaCredential::factory()->totp()->verified()->create([
        'user_id' => $user->getKey(),
    ]);
    $codes = $recoveryCodes->generate($user->getKey());

    // Burn six codes silently so the next consumption crosses the threshold.
    foreach (array_slice($codes, 0, 6) as $burned) {
        $recoveryCodes->verify($user->getKey(), $burned);
    }
    expect($recoveryCodes->remaining($user->getKey()))->toBe(2);

    $challenge = app(MfaChallengeStore::class)->create($user->getKey());

    $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challenge['challenge_id'],
        'method' => 'recovery_code',
        'code' => $codes[6],
    ])->assertOk();

    Notification::assertSentTo($user, LowRecoveryCodesNotification::class);
});
