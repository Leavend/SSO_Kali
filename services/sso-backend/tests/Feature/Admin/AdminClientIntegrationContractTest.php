<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;
use App\Models\AdminAuditEvent;
use App\Models\OidcClientRegistration;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://dev-sso.timeh.my.id');
    config()->set('sso.issuer', 'https://dev-sso.timeh.my.id');
    config()->set('sso.resource_audience', 'sso-resource-api');
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

it('returns a session validated client integration contract for admins', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-contract-1',
        'subject_uuid' => 'admin-contract-1',
        'role' => 'admin',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/contract', [
            'appName' => 'Customer Portal',
            'clientId' => 'customer-portal',
            'environment' => 'development',
            'clientType' => 'public',
            'appBaseUrl' => 'https://customer-dev.timeh.my.id',
            'callbackPath' => '/auth/callback',
            'logoutPath' => '/auth/backchannel/logout',
            'ownerEmail' => 'owner@company.com',
            'provisioning' => 'jit',
        ])
        ->assertOk()
        ->assertJsonPath('contract.clientId', 'customer-portal')
        ->assertJsonPath('contract.redirectUri', 'https://customer-dev.timeh.my.id/auth/callback')
        ->assertJsonPath('contract.provisioningManifest.mode', 'jit')
        ->assertJsonPath('contract.provisioningManifest.riskGates.0', 'Isolated dev callback')
        ->assertJsonPath('contract.env.1', 'SSO_CLIENT_ID=customer-portal');
});

it('returns validation violations without mutating session clients', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-contract-2',
        'subject_uuid' => 'admin-contract-2',
        'role' => 'admin',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/contract', [
            'appName' => 'Unsafe App',
            'clientId' => 'unsafe-app',
            'environment' => 'live',
            'clientType' => 'public',
            'appBaseUrl' => 'http://unsafe.timeh.my.id',
            'callbackPath' => '/auth/*',
            'logoutPath' => '/auth/backchannel/logout',
            'ownerEmail' => 'owner@company.com',
            'provisioning' => 'jit',
        ])
        ->assertStatus(422)
        ->assertJsonPath('error', 'client_integration_invalid')
        ->assertJsonPath('violations.0', 'Live client wajib memakai HTTPS.')
        ->assertJsonPath('violations.1', 'Callback path tidak boleh wildcard.');
});

it('rejects credentialed origins and path confusion in client contracts', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-contract-origin',
        'subject_uuid' => 'admin-contract-origin',
        'role' => 'admin',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/contract', [
            ...validClientDraft(),
            'appBaseUrl' => 'https://user:secret@customer-dev.timeh.my.id/app?next=/admin#token',
            'callbackPath' => '//customer-dev.timeh.my.id/auth/callback',
            'logoutPath' => '/../logout?token=leak',
        ])
        ->assertStatus(422)
        ->assertJsonPath('error', 'client_integration_invalid')
        ->assertJsonPath('violations.0', 'Base URL tidak boleh memuat credentials.')
        ->assertJsonPath('violations.1', 'Base URL hanya boleh berisi origin tanpa path, query, atau fragment.')
        ->assertJsonPath('violations.2', 'Callback path tidak boleh diawali //.')
        ->assertJsonPath('violations.3', 'Logout path tidak boleh mengandung query atau fragment.')
        ->assertJsonPath('violations.4', 'Logout path tidak boleh mengandung traversal.');
});

it('stages a valid registration without exposing verifier secrets', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-3');

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/stage', validClientDraft())
        ->assertOk()
        ->assertJsonPath('registration.client_id', 'customer-portal')
        ->assertJsonPath('registration.status', 'staged')
        ->assertJsonMissingPath('registration.secret_hash');

    expect(OidcClientRegistration::query()->where('client_id', 'customer-portal')->exists())->toBeTrue();
    expect(AdminAuditEvent::query()->where('action', 'stage_client_integration')->exists())->toBeTrue();
});

it('creates an active confidential client and returns its plaintext secret once', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-create-confidential');

    $response = $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations', [
            ...validClientDraft(),
            'clientId' => 'server-portal',
            'clientType' => 'confidential',
        ])
        ->assertCreated()
        ->assertJsonPath('registration.client_id', 'server-portal')
        ->assertJsonPath('registration.status', 'active')
        ->assertJsonPath('registration.has_secret_hash', true)
        ->assertJsonStructure(['plaintext_secret']);

    expect((string) $response->headers->get('Cache-Control'))->toContain('no-store');

    $plaintext = (string) $response->json('plaintext_secret');
    $registration = OidcClientRegistration::query()
        ->where('client_id', 'server-portal')
        ->firstOrFail();

    expect($plaintext)->toHaveLength(64)
        ->and($registration->secret_hash)->toBeString()->not->toBe($plaintext)
        ->and(app(ClientSecretHashPolicy::class)->verify($plaintext, (string) $registration->secret_hash))->toBeTrue()
        ->and($registration->secret_expires_at)->not->toBeNull()
        ->and(AdminAuditEvent::query()->where('action', 'create_client_integration')->exists())->toBeTrue();

    [$code, $verifier] = issueCreatedClientAuthorizationCode(
        'server-portal',
        'https://customer-dev.timeh.my.id/auth/callback',
    );

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'server-portal',
        'client_secret' => $plaintext,
        'redirect_uri' => 'https://customer-dev.timeh.my.id/auth/callback',
        'code' => $code,
        'code_verifier' => $verifier,
    ])->assertOk()
        ->assertJsonPath('token_type', 'Bearer');
});

it('creates an active public client without minting a secret', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-create-public');

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations', [
            ...validClientDraft(),
            'allowed_scopes' => ['openid', 'email'],
        ])
        ->assertCreated()
        ->assertJsonPath('registration.status', 'active')
        ->assertJsonPath('registration.has_secret_hash', false)
        ->assertJsonPath('registration.allowed_scopes', ['openid', 'email'])
        ->assertJsonMissingPath('plaintext_secret');

    $registration = OidcClientRegistration::query()
        ->where('client_id', 'customer-portal')
        ->firstOrFail();

    expect($registration->secret_hash)->toBeNull()
        ->and($registration->secret_expires_at)->toBeNull()
        ->and($registration->allowed_scopes)->toBe(['openid', 'email']);
});

it('stages canonical client origins for exact redirect matching', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-canonical');

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/stage', [
            ...validClientDraft(),
            'appBaseUrl' => 'HTTPS://Customer-Dev.Timeh.My.ID:443/',
        ])
        ->assertOk()
        ->assertJsonPath('registration.app_base_url', 'https://customer-dev.timeh.my.id')
        ->assertJsonPath('registration.redirect_uris.0', 'https://customer-dev.timeh.my.id/auth/callback')
        ->assertJsonPath('registration.post_logout_redirect_uris.0', 'https://customer-dev.timeh.my.id');
});

it('rejects duplicate dynamic registrations', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-4');

    OidcClientRegistration::query()->create([
        ...dynamicClientPayload(),
        'status' => 'staged',
    ]);

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/stage', validClientDraft())
        ->assertStatus(422)
        ->assertJsonPath('error', 'client_integration_invalid');
});

it('activates public dynamic clients for runtime authorization', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-5');

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/stage', validClientDraft())
        ->assertOk();

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/customer-portal/activate')
        ->assertOk()
        ->assertJsonPath('registration.status', 'active');

    $client = app(DownstreamClientRegistry::class)->resolve(
        'customer-portal',
        'https://customer-dev.timeh.my.id/auth/callback',
    );

    expect($client?->clientId)->toBe('customer-portal');
});

it('rejects confidential activation without an argon2id verifier hash', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-6');

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/stage', [
            ...validClientDraft(),
            'clientId' => 'server-portal',
            'clientType' => 'confidential',
        ])
        ->assertOk();

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/server-portal/activate', ['secretHash' => 'plaintext'])
        ->assertStatus(422);
});

it('disables active dynamic clients as a rollback mechanism', function (): void {
    /** @var TestCase $this */
    $admin = clientContractAdmin('admin-contract-7');
    $hash = app(ClientSecretHashPolicy::class)->make('client-secret');
    Queue::fake();

    OidcClientRegistration::query()->create([
        ...dynamicClientPayload('server-portal', 'confidential'),
        'secret_hash' => $hash,
        'status' => 'active',
        'activated_at' => now(),
    ]);
    $refresh = app(RefreshTokenStore::class)->issue(
        'subject-rollback',
        'server-portal',
        'openid profile',
        'sid-rollback',
        now()->timestamp,
    );

    app(AccessTokenRevocationStore::class)->track(
        'sid-rollback',
        'jti-rollback',
        now()->addMinutes(10)->timestamp,
        'server-portal',
    );

    $this->withToken(clientContractAccessToken($admin))
        ->postJson('/admin/api/client-integrations/server-portal/disable')
        ->assertOk()
        ->assertJsonPath('registration.status', 'disabled');

    expect(app(DownstreamClientRegistry::class)->find('server-portal'))->toBeNull();
    expect(app(RefreshTokenStore::class)->findActive($refresh['token'], 'server-portal'))->toBeNull();
    expect(app(AccessTokenRevocationStore::class)->revoked('jti-rollback'))->toBeTrue();
    Queue::assertPushed(DispatchBackChannelLogoutJob::class);
});

function clientContractAdmin(string $subjectId): User
{
    return User::factory()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'role' => 'admin',
    ]);
}

/**
 * @return array<string, string>
 */
function validClientDraft(): array
{
    return [
        'appName' => 'Customer Portal',
        'clientId' => 'customer-portal',
        'environment' => 'development',
        'clientType' => 'public',
        'appBaseUrl' => 'https://customer-dev.timeh.my.id',
        'callbackPath' => '/auth/callback',
        'logoutPath' => '/auth/backchannel/logout',
        'ownerEmail' => 'owner@company.com',
        'provisioning' => 'jit',
    ];
}

/**
 * @return array<string, mixed>
 */
function dynamicClientPayload(string $clientId = 'customer-portal', string $type = 'public'): array
{
    return [
        'client_id' => $clientId,
        'display_name' => 'Customer Portal',
        'type' => $type,
        'environment' => 'development',
        'app_base_url' => 'https://customer-dev.timeh.my.id',
        'redirect_uris' => ['https://customer-dev.timeh.my.id/auth/callback'],
        'post_logout_redirect_uris' => ['https://customer-dev.timeh.my.id'],
        'backchannel_logout_uri' => 'https://customer-dev.timeh.my.id/auth/backchannel/logout',
        'owner_email' => 'owner@company.com',
        'provisioning' => 'jit',
        'contract' => ['clientId' => $clientId],
    ];
}

function clientContractAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-contract-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

/**
 * @return array{0: string, 1: string}
 */
function issueCreatedClientAuthorizationCode(string $clientId, string $redirectUri): array
{
    [$user, $sessionId] = createdClientBrowserSessionUser();
    [$verifier, $challenge] = createdClientPkcePair();

    $response = test()
        ->withSession([
            'sso_browser_session' => [
                'subject_id' => $user->subject_id,
                'session_id' => $sessionId,
                'auth_time' => time(),
                'amr' => ['pwd'],
            ],
        ])
        ->get('/authorize?'.http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => 'state-'.Str::random(24),
            'nonce' => 'nonce-'.Str::random(24),
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]));

    $response->assertRedirect();
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['code'] ?? null)->toBeString()->not->toBe('');

    return [(string) $query['code'], $verifier];
}

/**
 * @return array{0: User, 1: string}
 */
function createdClientBrowserSessionUser(): array
{
    $user = User::factory()->create(['email' => 'created-client-'.Str::random(16).'@example.test']);
    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'AdminClientIntegrationContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

/**
 * @return array{0: string, 1: string}
 */
function createdClientPkcePair(): array
{
    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    return [$verifier, $challenge];
}
