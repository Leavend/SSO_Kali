<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;
use App\Models\AdminAuditEvent;
use App\Models\OidcClientRegistration;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * BE-FR012-001 — Suspend / Decommission MUST revoke existing tokens.
 *
 * Acceptance criteria locked here:
 *  1. Suspend (disable) and decommission revoke refresh tokens for the client.
 *  2. Active access tokens for the client cannot be used at /userinfo
 *     after suspend/decommission (introspection policy).
 *  3. Audit event is recorded with the correct taxonomy.
 *  4. Suspended/decommissioned clients cannot authorize new flows.
 *  5. Suspended/decommissioned clients cannot refresh existing tokens.
 *
 * @see services/sso-backend/app/Services/Oidc/ClientIntegrationRegistrationService.php
 * @see services/sso-backend/app/Services/Oidc/ClientIntegrationRollbackRevoker.php
 * @see services/sso-backend/app/Services/Oidc/AccessTokenGuard.php
 */
beforeEach(function (): void {
    config()->set('app.url', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients', [
        'sso-admin-panel' => [
            'type' => 'public',
            'redirect_uris' => ['https://dev-sso.timeh.my.id/auth/callback'],
            'post_logout_redirect_uris' => ['https://dev-sso.timeh.my.id'],
            'backchannel_logout_uri' => 'https://dev-sso.timeh.my.id/auth/backchannel/logout',
        ],
    ]);
});

it('disables an active client and rejects existing refresh tokens, access tokens, and new authorize flows', function (): void {
    /** @var TestCase $this */
    Queue::fake();
    $admin = lifecycleAdmin('admin-suspend-decom-1');

    $registration = stageActiveDynamicClient('downstream-portal');
    $session = lifecycleBrowserSession();

    $access = app(LocalTokenService::class)->issue([
        'client_id' => $registration->client_id,
        'scope' => 'openid profile email offline_access',
        'session_id' => $session['session_id'],
        'subject_id' => $session['user']->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
    ]);

    expect(app(DownstreamClientRegistry::class)->find($registration->client_id))
        ->not->toBeNull();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom((string) $access['access_token']))
        ->not->toThrow(RuntimeException::class);

    $this->withToken(lifecycleAdminAccessToken($admin))
        ->postJson('/admin/api/client-integrations/'.$registration->client_id.'/disable', [
            'reason' => 'security_incident',
        ])
        ->assertOk()
        ->assertJsonPath('registration.status', 'disabled');

    expect(app(DownstreamClientRegistry::class)->find($registration->client_id))->toBeNull();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom((string) $access['access_token']))
        ->toThrow(RuntimeException::class);

    expect(app(RefreshTokenStore::class)->findActive(
        (string) $access['refresh_token'],
        $registration->client_id,
    ))->toBeNull();

    Queue::assertPushed(DispatchBackChannelLogoutJob::class);

    $audit = AdminAuditEvent::query()
        ->where('action', 'disable_client_integration')
        ->latest('id')
        ->firstOrFail();

    expect($audit->outcome)->toBe('succeeded')
        ->and($audit->taxonomy)->toBe(AdminAuditTaxonomy::CLIENT_INTEGRATION_DISABLED)
        ->and($audit->context['client_id'] ?? null)->toBe($registration->client_id)
        ->and($audit->context['revoked_tokens'] ?? null)->toBeGreaterThanOrEqual(1)
        ->and($audit->reason)->toBeNull();
});

it('decommissions an active client and rejects existing refresh and access tokens', function (): void {
    /** @var TestCase $this */
    Queue::fake();
    $admin = lifecycleAdmin('admin-suspend-decom-2');

    $registration = stageActiveDynamicClient('downstream-portal-decom');
    $session = lifecycleBrowserSession();

    $access = app(LocalTokenService::class)->issue([
        'client_id' => $registration->client_id,
        'scope' => 'openid profile email offline_access',
        'session_id' => $session['session_id'],
        'subject_id' => $session['user']->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
    ]);

    $this->withToken(lifecycleAdminAccessToken($admin))
        ->deleteJson('/admin/api/clients/'.$registration->client_id)
        ->assertOk()
        ->assertJsonPath('registration.status', 'decommissioned');

    expect(app(DownstreamClientRegistry::class)->find($registration->client_id))->toBeNull();

    expect(fn () => app(AccessTokenGuard::class)->claimsFrom((string) $access['access_token']))
        ->toThrow(RuntimeException::class);

    expect(app(RefreshTokenStore::class)->findActive(
        (string) $access['refresh_token'],
        $registration->client_id,
    ))->toBeNull();

    $audit = AdminAuditEvent::query()
        ->where('action', 'decommission_client_integration')
        ->latest('id')
        ->firstOrFail();

    expect($audit->outcome)->toBe('succeeded')
        ->and($audit->taxonomy)->toBe(AdminAuditTaxonomy::CLIENT_INTEGRATION_DECOMMISSIONED)
        ->and($audit->context['client_id'] ?? null)->toBe($registration->client_id)
        ->and($audit->context['revoked_tokens'] ?? null)->toBeGreaterThanOrEqual(1);
});

it('rejects userinfo requests using access tokens issued for a disabled client', function (): void {
    /** @var TestCase $this */
    Queue::fake();
    $admin = lifecycleAdmin('admin-suspend-decom-3');

    $registration = stageActiveDynamicClient('downstream-userinfo');
    $session = lifecycleBrowserSession();

    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => $registration->client_id,
        'scope' => 'openid profile email',
        'session_id' => $session['session_id'],
        'subject_id' => $session['user']->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
    ]);

    $this->withToken((string) $tokens['access_token'])
        ->getJson('/userinfo')
        ->assertOk();

    $this->withToken(lifecycleAdminAccessToken($admin))
        ->postJson('/admin/api/client-integrations/'.$registration->client_id.'/disable')
        ->assertOk();

    $this->withToken((string) $tokens['access_token'])
        ->getJson('/userinfo')
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_token');
});

it('rejects authorize and refresh attempts after a confidential client is disabled', function (): void {
    /** @var TestCase $this */
    Queue::fake();
    $admin = lifecycleAdmin('admin-suspend-decom-4');

    $registration = stageActiveDynamicClient(
        clientId: 'downstream-confidential',
        type: 'confidential',
        secretHash: app(ClientSecretHashPolicy::class)->make('downstream-secret'),
    );
    $session = lifecycleBrowserSession();

    $access = app(LocalTokenService::class)->issue([
        'client_id' => $registration->client_id,
        'scope' => 'openid profile email offline_access',
        'session_id' => $session['session_id'],
        'subject_id' => $session['user']->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd'],
    ]);

    $this->withToken(lifecycleAdminAccessToken($admin))
        ->postJson('/admin/api/client-integrations/'.$registration->client_id.'/disable')
        ->assertOk();

    $this->withHeader('Authorization', 'Basic '.base64_encode($registration->client_id.':downstream-secret'))
        ->postJson('/token', [
            'grant_type' => 'refresh_token',
            'refresh_token' => $access['refresh_token'],
        ])
        ->assertStatus(401)
        ->assertJsonPath('error', 'invalid_client');

    $this->withSession([
        'sso_browser_session' => [
            'subject_id' => $session['user']->subject_id,
            'session_id' => $session['session_id'],
            'auth_time' => time(),
            'amr' => ['pwd'],
        ],
    ])
        ->get('/authorize?'.http_build_query([
            'client_id' => $registration->client_id,
            'redirect_uri' => 'https://downstream-confidential.timeh.my.id/auth/callback',
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => 'state-'.Str::random(16),
            'nonce' => 'nonce-'.Str::random(16),
            'code_challenge' => 'challenge-placeholder',
            'code_challenge_method' => 'S256',
        ]))
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_client');
});

function lifecycleAdmin(string $subjectId): User
{
    return User::factory()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'role' => 'admin',
    ]);
}

function lifecycleAdminAccessToken(User $admin): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-suspend-session-'.$admin->subject_id,
        'subject_id' => $admin->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

/**
 * @return array{user: User, session_id: string}
 */
function lifecycleBrowserSession(): array
{
    $user = User::factory()->create([
        'email' => 'lifecycle-'.Str::random(12).'@example.test',
    ]);

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'BE-FR012-001-Contract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return ['user' => $user, 'session_id' => $sessionId];
}

function stageActiveDynamicClient(
    string $clientId,
    string $type = 'public',
    ?string $secretHash = null,
): OidcClientRegistration {
    $registration = OidcClientRegistration::query()->create([
        'client_id' => $clientId,
        'display_name' => ucfirst($clientId),
        'type' => $type,
        'environment' => 'development',
        'app_base_url' => 'https://'.$clientId.'.timeh.my.id',
        'redirect_uris' => ['https://'.$clientId.'.timeh.my.id/auth/callback'],
        'post_logout_redirect_uris' => ['https://'.$clientId.'.timeh.my.id'],
        'backchannel_logout_uri' => 'https://'.$clientId.'.timeh.my.id/auth/backchannel/logout',
        'owner_email' => 'owner@'.$clientId.'.example',
        'provisioning' => 'jit',
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
        'contract' => ['clientId' => $clientId],
        'status' => 'active',
        'secret_hash' => $secretHash,
        'activated_at' => now(),
    ]);

    app(DownstreamClientRegistry::class)->flush();

    return $registration;
}
