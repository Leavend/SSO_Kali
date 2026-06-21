<?php

declare(strict_types=1);

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\AuthenticationAuditEvent;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Carbon;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    $this->seed(RbacSeeder::class);
});

it('requires dedicated admin authentication audit read permission for authentication audit access', function (): void {
    $admin = authenticationAuditAdmin([AdminPermission::AUDIT_READ]);

    $this->getJson('/admin/api/audit/authentication-events', authenticationAuditHeaders($admin))
        ->assertStatus(403);
});

it('lists filters and paginates central authentication audit events safely', function (): void {
    $admin = authenticationAuditAdmin([AdminPermission::AUTHENTICATION_AUDIT_READ]);
    authenticationAuditRecord('login_succeeded', 'succeeded', [
        'subject_id' => 'subject-login-85',
        'email' => 'login85@example.com',
        'session_id' => 'session-login-85',
        'request_id' => 'req-auth-audit-login-85',
        'context' => ['access_token' => 'raw-access-token-must-not-leak-85', 'safe' => 'visible'],
        'occurred_at' => now()->subHour(),
    ]);
    authenticationAuditRecord('token_revoked', 'succeeded', [
        'subject_id' => 'subject-token-85',
        'client_id' => 'app-a',
        'request_id' => 'req-auth-audit-token-85',
        'session_id' => 'session-token-85',
        'context' => ['token_hash' => hash('sha256', 'token-85'), 'token_type_hint' => 'refresh_token'],
        'occurred_at' => now()->subDays(2),
    ]);
    authenticationAuditRecord('consent_decision', 'succeeded', [
        'subject_id' => 'subject-consent-85',
        'client_id' => 'app-a',
        'request_id' => 'req-auth-audit-consent-85',
        'context' => ['decision' => 'revoke', 'consent_action' => 'revoke'],
        'occurred_at' => now()->subMinutes(10),
    ]);

    $response = $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'event_type' => 'login_succeeded',
        'outcome' => 'succeeded',
        'subject_id' => 'subject-login-85',
        'session_id' => 'session-login-85',
        'request_id' => 'req-auth-audit-login-85',
        'from' => now()->subDay()->toIso8601String(),
        'to' => now()->addMinute()->toIso8601String(),
        'limit' => 1,
    ]), authenticationAuditHeaders($admin));

    $response->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_type', 'login_succeeded')
        ->assertJsonPath('events.0.subject.subject_id', 'subject-login-85')
        ->assertJsonPath('events.0.subject.email', 'login85@example.com')
        ->assertJsonPath('events.0.context.access_token', '[redacted]')
        ->assertJsonPath('events.0.context.safe', 'visible')
        ->assertJsonStructure(['events' => [['event_id', 'event_type', 'outcome', 'subject', 'request', 'context', 'occurred_at']], 'pagination']);

    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))->not->toContain('raw-access-token-must-not-leak-85');

    $cursorResponse = $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'limit' => 1,
    ]), authenticationAuditHeaders($admin));

    $nextCursor = $cursorResponse->json('pagination.next_cursor');
    expect($nextCursor)->toBeString();

    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'limit' => 1,
        'cursor' => $nextCursor,
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events');

    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'event_type' => 'consent_decision',
        'client_id' => 'app-a',
        'subject_id' => 'subject-consent-85',
        'consent_action' => 'revoke',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_type', 'consent_decision')
        ->assertJsonPath('events.0.context.decision', 'revoke');
});

it('shows one central authentication audit event and returns not found for unknown event ids', function (): void {
    $admin = authenticationAuditAdmin([AdminPermission::AUTHENTICATION_AUDIT_READ]);
    authenticationAuditRecord('external_idp_callback_failed', 'failed', [
        'subject_id' => null,
        'client_id' => 'sso-upstream',
        'error_code' => 'external_id_p_nonce_claim_mismatch.',
        'request_id' => 'req-auth-audit-show-85',
        'context' => ['id_token' => 'raw-id-token-must-not-leak-85', 'state_hash' => hash('sha256', 'state-85')],
    ]);
    $event = AuthenticationAuditEvent::query()->latest('id')->firstOrFail();

    $response = $this->getJson('/admin/api/audit/authentication-events/'.$event->event_id, authenticationAuditHeaders($admin));

    $response->assertOk()
        ->assertJsonPath('event.event_id', $event->event_id)
        ->assertJsonPath('event.event_type', 'external_idp_callback_failed')
        ->assertJsonPath('event.error_code', 'external_id_p_nonce_claim_mismatch.')
        ->assertJsonPath('event.context.id_token', '[redacted]')
        ->assertJsonPath('event.context.state_hash', hash('sha256', 'state-85'));

    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))->not->toContain('raw-id-token-must-not-leak-85');

    $this->getJson('/admin/api/audit/authentication-events/01UNKNOWNUNKNOWNUNKNOWNUNK', authenticationAuditHeaders($admin))
        ->assertStatus(404)
        ->assertJsonPath('error', 'Authentication audit event not found.');
});

it('correctly filters authentication audit events with the refined query matching behaviors', function (): void {
    $admin = authenticationAuditAdmin([AdminPermission::AUTHENTICATION_AUDIT_READ]);

    // Create seed records
    // Record 1: Normal login
    authenticationAuditRecord('login_succeeded', 'succeeded', [
        'subject_id' => 'usr_alex_12345678',
        'client_id' => 'sso-admin-panel',
        'session_id' => 'sess_active_999999',
        'request_id' => 'req_login_abcde123',
        'error_code' => 'ERR_BAD_CREDENTIALS',
        'occurred_at' => Carbon::create(2026, 6, 21, 12, 0, 0, 'Asia/Makassar')->setTimezone('UTC'),
    ]);

    // Record 2: Consent decision
    authenticationAuditRecord('consent_decision', 'succeeded', [
        'subject_id' => 'usr_bob_87654321',
        'client_id' => 'app-a',
        'session_id' => 'sess_active_888888',
        'request_id' => 'req_consent_xyz',
        'context' => ['consent_action' => 'allow'],
        'occurred_at' => Carbon::create(2026, 6, 21, 23, 30, 0, 'Asia/Makassar')->setTimezone('UTC'),
    ]);

    // Configure display timezone
    config(['sso.display_timezone' => 'Asia/Makassar']);

    // 1. Suffix/REF matching on subject_id, session_id
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'subject_id' => 'REF-12345678',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.subject.subject_id', 'usr_alex_12345678');

    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'session_id' => 'REF-VE999999',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.session_id', 'sess_active_999999');

    // 2. Case- & separator-insensitive match on client_id friendly name / slug
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'client_id' => 'SSO Admin Panel',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.client_id', 'sso-admin-panel');

    // 3. Case-insensitive matching on event_type
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'event_type' => 'LOGIN_SUCCEEDED',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_type', 'login_succeeded');

    // 4. Case-insensitive partial (LIKE) matching on error_code
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'error_code' => 'bad_credentials',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.error_code', 'ERR_BAD_CREDENTIALS');

    // 5. Consent action matching (context->consent_action)
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'consent_action' => 'allow',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(1, 'events')
        ->assertJsonPath('events.0.event_type', 'consent_decision');

    // 6. Timezone-aware date boundaries (inclusive of the whole day 2026-06-21)
    $this->getJson('/admin/api/audit/authentication-events?'.http_build_query([
        'from' => '2026-06-21',
        'to' => '2026-06-21',
    ]), authenticationAuditHeaders($admin))
        ->assertOk()
        ->assertJsonCount(2, 'events');
});

function authenticationAuditAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'auth-audit-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'auth-audit-role-'.uniqid(), 'name' => 'Authentication Audit Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/**
 * @return array<string, string>
 */
function authenticationAuditHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'auth-audit-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}

/**
 * @param  array<string, mixed>  $overrides
 */
function authenticationAuditRecord(string $eventType, string $outcome, array $overrides = []): void
{
    app(RecordAuthenticationAuditEventAction::class)->execute(new AuthenticationAuditRecord(
        eventType: $eventType,
        outcome: $outcome,
        subjectId: $overrides['subject_id'] ?? null,
        email: $overrides['email'] ?? null,
        clientId: $overrides['client_id'] ?? 'app-a',
        sessionId: $overrides['session_id'] ?? null,
        ipAddress: '203.0.113.151',
        userAgent: 'Issue85AuthenticationAuditApi/1.0',
        errorCode: $overrides['error_code'] ?? null,
        requestId: $overrides['request_id'] ?? 'req-auth-audit-85',
        context: $overrides['context'] ?? null,
        occurredAt: $overrides['occurred_at'] ?? now(),
    ));
}
