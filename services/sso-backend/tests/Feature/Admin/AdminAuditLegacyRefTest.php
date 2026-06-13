<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\LocalTokenService;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

/**
 * ISS-N3: Gate test verifying support_reference suffix matching
 * against hyphenated legacy request_ids — must run under Postgres.
 *
 * This test fails (RED) before fixes N1 and N2, proving the gate
 * correctly executes the broken code paths.
 */
beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);
    $this->seed(RbacSeeder::class);
});

describe('admin-audit list with hyphenated legacy request_id', function (): void {
    it('finds legacy audit events by REF derived from hyphenated request_id', function (): void {
        $admin = legacyRefAdmin([AdminPermission::AUDIT_READ]);
        $store = legacyRefStore();

        // Legacy event: only context.request_id, no support_reference field
        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => 'test-req-999',
        ]));
        // Modern event with support_reference
        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => '01HX7S8Y9ZABCDEF34567890',
            'support_reference' => 'REF-34567890',
        ]));
        // Non-matching event
        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => '01OTHER00000000000XXXXXX',
        ]));

        // Search by REF derived from hyphenated request_id test-req-999 → REF-STREQ999
        $response = $this->getJson(
            '/admin/api/audit/events?'.http_build_query(['support_reference' => 'REF-STREQ999']),
            legacyRefHeaders($admin),
        );

        $response->assertOk();
        $events = $response->json('events');
        expect($events)->toHaveCount(1)
            ->and($events[0]['context']['request_id'])->toBe('test-req-999');
    });

    it('finds legacy audit events by bare suffix from hyphenated request_id', function (): void {
        $admin = legacyRefAdmin([AdminPermission::AUDIT_READ]);
        $store = legacyRefStore();

        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => 'test-req-999',
        ]));

        // Bare 8-char suffix (no REF- prefix)
        $response = $this->getJson(
            '/admin/api/audit/events?'.http_build_query(['support_reference' => 'STREQ999']),
            legacyRefHeaders($admin),
        );

        $response->assertOk();
        $events = $response->json('events');
        expect($events)->toHaveCount(1)
            ->and($events[0]['context']['request_id'])->toBe('test-req-999');
    });

    it('still matches clean ULID request_id (no regression)', function (): void {
        $admin = legacyRefAdmin([AdminPermission::AUDIT_READ]);
        $store = legacyRefStore();

        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => '01HX7S8Y9ZABCDEF34567890',
        ]));

        $response = $this->getJson(
            '/admin/api/audit/events?'.http_build_query(['support_reference' => 'REF-34567890']),
            legacyRefHeaders($admin),
        );

        $response->assertOk();
        $events = $response->json('events');
        expect($events)->toHaveCount(1)
            ->and($events[0]['context']['request_id'])->toBe('01HX7S8Y9ZABCDEF34567890');
    });
});

describe('admin-audit export with hyphenated legacy request_id', function (): void {
    it('finds legacy audit events in export by REF from hyphenated request_id', function (): void {
        $admin = legacyRefAdmin([AdminPermission::AUDIT_EXPORT]);
        $store = legacyRefStore();

        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => 'test-req-999',
        ]));
        $store->append(legacyRefPayload('succeeded', 'admin_api', [
            'request_id' => '01OTHER00000000000XXXXXX',
        ]));

        $response = $this->getJson(
            '/admin/api/audit/export?'.http_build_query([
                'format' => 'csv',
                'support_reference' => 'REF-STREQ999',
            ]),
            legacyRefHeaders($admin),
        );

        $response->assertOk();
        $content = $response->streamedContent();
        $rows = array_filter(explode("\n", trim($content)));
        // Header row + 1 matching data row = 2 lines
        expect($rows)->toHaveCount(2);
    });
});

describe('authentication-audit with hyphenated request_id', function (): void {
    beforeEach(function (): void {
        config()->set('sso.base_url', 'http://localhost');
        config()->set('sso.issuer', 'http://localhost');
        config()->set('sso.resource_audience', 'sso-resource-api');
        config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
        config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
        config()->set('sso.admin.session_management_roles', ['admin']);
        config()->set('sso.admin.mfa.enforced', false);

        $admin = User::factory()->create([
            'subject_id' => 'auth-audit-legacy-admin',
            'subject_uuid' => 'auth-audit-legacy-admin',
            'role' => 'admin',
        ]);
        $this->adminToken = legacyRefToken($admin);
    });

    it('finds auth events by REF from hyphenated request_id', function (): void {
        AuthenticationAuditEvent::query()->create([
            'event_id' => 'legacy-hyphen-match-01',
            'event_type' => 'login_started',
            'outcome' => 'succeeded',
            'subject_id' => 'sub-hyphen-match',
            'request_id' => 'test-req-999',
            'occurred_at' => now(),
        ]);

        AuthenticationAuditEvent::query()->create([
            'event_id' => 'legacy-hyphen-other-02',
            'event_type' => 'login_other',
            'outcome' => 'succeeded',
            'subject_id' => 'sub-hyphen-other',
            'request_id' => '01OTHER00000000000XXXXXX',
            'occurred_at' => now(),
        ]);

        $response = $this->withToken($this->adminToken)
            ->getJson('/admin/api/audit/authentication-events?support_reference=REF-STREQ999&limit=50');

        $response->assertOk();
        $events = $response->json('events');
        expect($events)->toHaveCount(1)
            ->and($events[0]['subject']['subject_id'])->toBe('sub-hyphen-match');
    });
});

/* ---------- Inline helpers (mirror AdminAuditTrailContractTest + AuthSupportReferenceSearchTest) ---------- */

if (! function_exists('legacyRefAdmin')) {
    function legacyRefAdmin(array $permissions): User
    {
        $user = User::factory()->create([
            'subject_id' => 'audit-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
            'role' => 'admin',
        ]);
        $role = Role::query()->create(['slug' => 'audit-role-'.uniqid(), 'name' => 'Audit Role']);
        $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
        $role->permissions()->sync($permissionIds);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}

if (! function_exists('legacyRefHeaders')) {
    /** @return array<string, string> */
    function legacyRefHeaders(User $user): array
    {
        $tokens = app(LocalTokenService::class)->issue([
            'subject_id' => $user->subject_id,
            'client_id' => 'app-a',
            'scope' => 'openid profile email roles permissions',
            'session_id' => 'audit-trail-session',
            'auth_time' => time(),
            'amr' => ['pwd'],
        ]);

        return ['Authorization' => 'Bearer '.$tokens['access_token']];
    }
}

if (! function_exists('legacyRefStore')) {
    function legacyRefStore(): AdminAuditEventStore
    {
        return app(AdminAuditEventStore::class);
    }
}

if (! function_exists('legacyRefPayload')) {
    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    function legacyRefPayload(string $outcome, string $action, array $context = [], string $adminSubjectId = 'admin-1', mixed $occurredAt = null): array
    {
        return [
            'action' => $action,
            'outcome' => $outcome,
            'taxonomy' => AdminAuditTaxonomy::FORBIDDEN,
            'admin_subject_id' => $adminSubjectId,
            'admin_email' => 'admin@example.com',
            'admin_role' => 'admin',
            'method' => 'GET',
            'path' => 'admin/api/audit/events',
            'ip_address' => '127.0.0.1',
            'reason' => 'policy',
            'context' => $context,
            'occurred_at' => $occurredAt ?? now(),
        ];
    }
}

if (! function_exists('legacyRefToken')) {
    function legacyRefToken(User $user): string
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
}
