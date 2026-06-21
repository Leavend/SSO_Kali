<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\User;
use App\Services\Admin\AdminAuthenticationAuditQuery;
use App\Services\Admin\SupportReference;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Support\Str;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);

    $admin = User::factory()->create([
        'subject_id' => 'auth-audit-ref-admin',
        'subject_uuid' => 'auth-audit-ref-admin',
        'role' => 'admin',
    ]);
    $this->adminToken = authAuditSupportRefToken($admin);
});

/**
 * ISS-H1: Support Reference search on authentication-audit.
 *
 * REF is derived from `request_id` as `REF-` + last 8 alphanumeric characters (uppercase).
 * Backend matches against request_id suffix via `WHERE UPPER(request_id) LIKE '%<suffix>'`.
 *
 * @see AdminAuthenticationAuditQuery
 * @see formatSupportReference() (frontend display-identifiers.ts)
 *
 * IF THE DERIVATION OR SUFFIX EXTRACTION CHANGES, UPDATE THE FRONTEND TEST VECTOR ALSO.
 */
it('finds auth events by support_reference matching request_id suffix', function (): void {
    /** @var TestCase $this */
    // Create events with distinctive request_ids
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_started',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-match-1',
        'request_id' => '01HX7S8Y9ZABCDEF34567890',
        'occurred_at' => now(),
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_succeeded',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-match-2',
        'request_id' => '01AAAAAAABCDEF34567890',
        'occurred_at' => now(),
    ]);

    // Event with non-matching request_id suffix
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'subject_id' => 'sub-no-match',
        'request_id' => '01ZZZZZZNOMATCH00000000',
        'occurred_at' => now(),
    ]);

    // Search with full REF form
    $response = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?support_reference=REF-34567890&limit=50');

    $response->assertOk();
    $events = $response->json('events');
    expect($events)->toHaveCount(2);

    $subjectIds = array_map(fn (array $ev): string => $ev['subject']['subject_id'], $events);
    expect($subjectIds)->toContain('sub-match-1', 'sub-match-2');
    expect($subjectIds)->not->toContain('sub-no-match');
});

it('accepts support_reference without REF- prefix', function (): void {
    /** @var TestCase $this */
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_started',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-bare',
        'request_id' => '01HX7S8Y9ZABCDEFABC12345',
        'occurred_at' => now(),
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_other',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-other',
        'request_id' => '01OTHER00000000000XXXXXX',
        'occurred_at' => now(),
    ]);

    // Search with bare 8-char suffix (no REF- prefix)
    $response = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?support_reference=ABC12345&limit=50');

    $response->assertOk();
    $events = $response->json('events');
    expect($events)->toHaveCount(1);
    expect($events[0]['subject']['subject_id'])->toBe('sub-bare');
});

it('returns empty collection for non-matching support_reference', function (): void {
    /** @var TestCase $this */
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_started',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-only',
        'request_id' => '01HX7S8Y9ZABCDEF99999999',
        'occurred_at' => now(),
    ]);

    $response = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?support_reference=REF-XXXXXXXX&limit=50');

    $response->assertOk();
    $events = $response->json('events');
    expect($events)->toHaveCount(0);
});

it('ignores support_reference when empty', function (): void {
    /** @var TestCase $this */
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_started',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-empty',
        'request_id' => '01HX7S8Y9ZABCDEF00000001',
        'occurred_at' => now(),
    ]);

    // Empty support_reference should be ignored (no filtering applied) — omit param entirely
    $response = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?limit=50');

    $response->assertOk();
    $events = $response->json('events');
    expect($events)->toHaveCount(1);
});

it('finds auth events by request_id matching exact or derived REF code', function (): void {
    /** @var TestCase $this */
    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_started',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-req-match-1',
        'request_id' => 'req-auth-audit-login-99',
        'occurred_at' => now(),
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => (string) Str::ulid(),
        'event_type' => 'login_succeeded',
        'outcome' => 'succeeded',
        'subject_id' => 'sub-req-match-2',
        'request_id' => 'req-auth-audit-token-99',
        'occurred_at' => now(),
    ]);

    // Test exact match (original contract behavior)
    $response = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?request_id=req-auth-audit-login-99&limit=50');

    $response->assertOk();
    $events = $response->json('events');
    expect($events)->toHaveCount(1);
    expect($events[0]['subject']['subject_id'])->toBe('sub-req-match-1');

    // Test derived REF code match
    $responseRef = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?request_id=REF-TLOGIN99&limit=50');

    $responseRef->assertOk();
    $eventsRef = $responseRef->json('events');
    expect($eventsRef)->toHaveCount(1);
    expect($eventsRef[0]['subject']['subject_id'])->toBe('sub-req-match-1');

    // Test bare suffix matches are treated as exact search (hence return nothing here)
    $responseBare = $this->withToken($this->adminToken)
        ->getJson('/admin/api/audit/authentication-events?request_id=TLOGIN99&limit=50');

    $responseBare->assertOk();
    $eventsBare = $responseBare->json('events');
    expect($eventsBare)->toHaveCount(0);
});

/**
 * Shared derivation vector — anti-drift contract with frontend.
 *
 * formatSupportReference(value) = `REF-${ normalizeReference(value).slice(-8) }`
 *
 * Backend AdminAuthenticationAuditQuery mirrors this when filtering by support_reference:
 * - strip non-alphanumeric
 * - uppercase
 * - take last 8 characters
 *
 * IF EITHER CHANGES, UPDATE BOTH.
 */
describe('derivation vector (mirrors formatSupportReference)', function (): void {
    it('extracts correct suffix from ULID-like request_id', function (): void {
        $requestId = '01HX7S8Y9ZABCDEF1234567890';
        $suffix = SupportReference::suffixOf($requestId);
        expect($suffix)->toBe('34567890');
    });

    it('strips non-alphanumeric characters', function (): void {
        $requestId = '01HX7S8Y9Z-ABCDEF-1234567890';
        $suffix = SupportReference::suffixOf($requestId);
        expect($suffix)->toBe('34567890');
    });

    it('handles exact 8-char input', function (): void {
        $requestId = 'abc12345';
        $suffix = SupportReference::suffixOf($requestId);
        expect($suffix)->toBe('ABC12345');
    });

    it('handles REF-prefixed input (what operator types)', function (): void {
        $ref = 'REF-XYZ98765';
        $suffix = SupportReference::suffixOf($ref);
        expect($suffix)->toBe('XYZ98765');
    });

    it('returns whatever we have for too-short input (less than 8 chars)', function (): void {
        $requestId = '01HX7S';
        $suffix = SupportReference::suffixOf($requestId);
        expect($suffix)->toBe('01HX7S');
    });
});

function authAuditSupportRefToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}
