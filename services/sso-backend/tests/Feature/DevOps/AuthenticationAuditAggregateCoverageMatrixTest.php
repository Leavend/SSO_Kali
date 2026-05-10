<?php

declare(strict_types=1);

it('locks the complete FR-006 authentication audit aggregate evidence set', function (): void {
    foreach (fr006_authentication_audit_contracts() as $relativePath => $needles) {
        $content = fr006_authentication_audit_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('maps FR-006 authentication audit coverage to implementation domains', function (): void {
    $coverage = fr006_authentication_audit_coverage_matrix();

    expect(array_keys($coverage))->toBe([
        'domain_model',
        'central_event_store',
        'login_events',
        'authorization_events',
        'token_lifecycle_events',
        'token_revocation_events',
        'logout_events',
        'external_idp_events',
        'admin_api',
        'admin_permission_matrix',
        'retention_compliance',
        'observability',
        'production_smoke',
    ]);

    foreach ($coverage as $domain => $evidence) {
        expect($evidence, "{$domain} must have evidence files")->not->toBeEmpty();

        foreach ($evidence as $relativePath) {
            expect(fr006_authentication_audit_file($relativePath), "{$domain}: {$relativePath} must exist")
                ->toBeString()
                ->not->toBe('');
        }
    }
});

it('maps FR-006 authentication audit requirements to compliance principles', function (): void {
    expect(fr006_authentication_audit_principles())->toBe([
        'least_privilege' => 'Admin authentication audit access uses a dedicated RBAC permission and menu capability.',
        'data_minimization' => 'Sensitive token-like and protocol values are redacted or hashed before persistence and logs.',
        'immutability' => 'Authentication audit events are append-only and protected from update/delete mutation.',
        'traceability' => 'Events carry request_id, event_id, subject, client, session, outcome, and error correlation fields.',
        'retention' => 'Retention is configurable, bounded, dry-run-capable, and scheduled for compliance operations.',
        'operability' => 'Structured logs and command output provide evidence for production observability.',
    ]);
});

it('keeps every FR-006 authentication audit aggregate dependency wired into CI', function (): void {
    $ci = fr006_authentication_audit_file('../../.github/workflows/ci.yml');

    foreach (fr006_authentication_audit_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

/**
 * @return array<string, list<string>>
 */
function fr006_authentication_audit_contracts(): array
{
    return [
        'database/migrations/2026_05_10_000001_create_authentication_audit_events_table.php' => [
            'authentication_audit_events',
            'event_id',
            'event_type',
            'request_id',
            'context',
        ],
        'app/Models/AuthenticationAuditEvent.php' => [
            'AuthenticationAuditEvent',
            'Authentication audit events are immutable',
            'updating',
            'deleting',
        ],
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'login',
            'authorization',
            'tokenLifecycle',
            'logoutLifecycle',
            'externalIdpAuthentication',
        ],
        'app/Services/Audit/AuthenticationAuditEventStore.php' => [
            'event_id',
            'Str::ulid',
            'normalizedTimestamp',
        ],
        'app/Actions/Audit/RecordAuthenticationAuditEventAction.php' => [
            'AuthenticationAuditRedactor',
            '[SSO_AUTHENTICATION_AUDIT_PERSISTED]',
            '[SSO_AUTHENTICATION_AUDIT_PERSISTENCE_FAILED]',
        ],
        'app/Services/Audit/AuthenticationAuditRedactor.php' => [
            'access_token',
            'refresh_token',
            'id_token',
            'client_secret',
            '[REDACTED]',
        ],
        'tests/Feature/Auth/AuthenticationAuditDomainModelTest.php' => [
            'records failed login attempts without leaking credentials',
            'records successful login with subject and session context',
            'prevents authentication audit mutation and deletion',
        ],
        'tests/Feature/Auth/CentralAuthenticationAuditEventStoreTest.php' => [
            'centralizes typed authentication audit persistence and recursive redaction',
            'provides named factories for login audit event producers',
        ],
        'tests/Feature/Auth/LoginSuccessFailureAuditContractTest.php' => [
            'records a complete failed login audit contract without sensitive leakage',
            'records a complete successful login audit contract with session correlation',
        ],
        'tests/Feature/Oidc/AuthorizationRequestAuditContractTest.php' => [
            'records accepted authorization requests without leaking state nonce or redirect uri',
            'records rejected authorization requests with safe protocol context',
        ],
        'tests/Feature/Oidc/TokenLifecycleAuditContractTest.php' => [
            'records token issuance refresh replay and revocation lifecycle audit events without token leakage',
        ],
        'tests/Feature/Oidc/TokenRevocationAuditContractTest.php' => [
            'records refresh-token revocation audit with family correlation hash and no raw token leakage',
            'records access-token revocation audit with jti correlation hash and no raw token leakage',
            'records rfc7009 idempotent unknown-token and invalid-client revocation audits safely',
        ],
        'tests/Feature/Oidc/LogoutAuthenticationAuditContractTest.php' => [
            'records front-channel logout success and failure in the central authentication audit store without protocol leakage',
            'records centralized logout success and invalid-token failure in the central authentication audit store',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpAuthenticationAuditContractTest.php' => [
            'records external idp redirect callback and account-link authentication audit events without token leakage',
            'records external idp callback and account-link failure authentication audits safely',
        ],
        'app/Http/Controllers/Admin/AuthenticationAuditController.php' => [
            'ListAuthenticationAuditEventsRequest',
            'AdminAuthenticationAuditQuery',
            'AdminAuthenticationAuditPresenter',
        ],
        'app/Services/Admin/AdminAuthenticationAuditPresenter.php' => [
            'redact',
            '[redacted]',
            'request_id',
        ],
        'app/Support/Rbac/AdminPermission.php' => [
            'AUTHENTICATION_AUDIT_READ',
            'admin.authentication-audit.read',
        ],
        'app/Support/Rbac/AdminMenu.php' => [
            'AUTHENTICATION_AUDIT',
            'Authentication Audit',
        ],
        'app/Services/Audit/AuthenticationAuditRetentionPolicy.php' => [
            'MINIMUM_RETENTION_DAYS = 90',
            'MAXIMUM_RETENTION_DAYS = 2555',
            'candidateCount',
            'prune',
        ],
        'app/Console/Commands/PruneAuthenticationAuditEvents.php' => [
            'sso:prune-authentication-audit-events',
            '--dry-run',
            'Authentication audit prune candidate row(s)',
        ],
        'tests/Feature/Auth/AuthenticationAuditObservabilityEvidenceContractTest.php' => [
            'emits structured authentication audit persistence logs with correlation identifiers',
            'issue88-access-token-must-not-leak',
            'exposes retention command observability output for compliance operations',
        ],
    ];
}

/**
 * @return array<string, list<string>>
 */
function fr006_authentication_audit_coverage_matrix(): array
{
    return [
        'domain_model' => [
            'database/migrations/2026_05_10_000001_create_authentication_audit_events_table.php',
            'app/Models/AuthenticationAuditEvent.php',
            'app/Support/Audit/AuthenticationAuditRecord.php',
            'tests/Feature/Auth/AuthenticationAuditDomainModelTest.php',
            'tests/Feature/DevOps/AuthenticationAuditDomainEvidenceTest.php',
        ],
        'central_event_store' => [
            'app/Services/Audit/AuthenticationAuditEventStore.php',
            'app/Actions/Audit/RecordAuthenticationAuditEventAction.php',
            'app/Services/Audit/AuthenticationAuditRedactor.php',
            'tests/Feature/Auth/CentralAuthenticationAuditEventStoreTest.php',
            'tests/Feature/DevOps/CentralAuthenticationAuditEventStoreEvidenceTest.php',
        ],
        'login_events' => [
            'tests/Feature/Auth/LoginSuccessFailureAuditContractTest.php',
            'tests/Feature/DevOps/LoginSuccessFailureAuditContractEvidenceTest.php',
        ],
        'authorization_events' => [
            'tests/Feature/Oidc/AuthorizationRequestAuditContractTest.php',
            'tests/Feature/DevOps/AuthorizationRequestAuditContractEvidenceTest.php',
        ],
        'token_lifecycle_events' => [
            'tests/Feature/Oidc/TokenLifecycleAuditContractTest.php',
            'tests/Feature/DevOps/TokenLifecycleAuditContractEvidenceTest.php',
        ],
        'token_revocation_events' => [
            'tests/Feature/Oidc/TokenRevocationAuditContractTest.php',
            'tests/Feature/DevOps/TokenRevocationAuditContractEvidenceTest.php',
        ],
        'logout_events' => [
            'tests/Feature/Oidc/LogoutAuthenticationAuditContractTest.php',
            'tests/Feature/DevOps/LogoutAuthenticationAuditContractEvidenceTest.php',
        ],
        'external_idp_events' => [
            'tests/Feature/ExternalIdp/ExternalIdpAuthenticationAuditContractTest.php',
            'tests/Feature/DevOps/ExternalIdpAuthenticationAuditContractEvidenceTest.php',
        ],
        'admin_api' => [
            'app/Http/Controllers/Admin/AuthenticationAuditController.php',
            'app/Services/Admin/AdminAuthenticationAuditQuery.php',
            'app/Services/Admin/AdminAuthenticationAuditPresenter.php',
            'tests/Feature/Admin/AdminAuthenticationAuditApiContractTest.php',
            'tests/Feature/DevOps/AdminAuthenticationAuditApiEvidenceTest.php',
        ],
        'admin_permission_matrix' => [
            'app/Support/Rbac/AdminPermission.php',
            'app/Support/Rbac/AdminMenu.php',
            'app/Services/Admin/AdminPermissionMatrix.php',
            'tests/Feature/Admin/AuthenticationAuditPermissionMatrixContractTest.php',
            'tests/Feature/DevOps/AuthenticationAuditPermissionMatrixEvidenceTest.php',
        ],
        'retention_compliance' => [
            'app/Services/Audit/AuthenticationAuditRetentionPolicy.php',
            'app/Console/Commands/PruneAuthenticationAuditEvents.php',
            'tests/Feature/Auth/AuthenticationAuditRetentionComplianceContractTest.php',
            'tests/Feature/DevOps/AuthenticationAuditRetentionComplianceEvidenceTest.php',
        ],
        'observability' => [
            'app/Actions/Audit/RecordAuthenticationAuditEventAction.php',
            'tests/Feature/Auth/AuthenticationAuditObservabilityEvidenceContractTest.php',
            'tests/Feature/DevOps/AuthenticationAuditObservabilityEvidenceTest.php',
        ],
        'production_smoke' => [
            'tests/Feature/DevOps/AuthenticationAuditProductionSmokeEvidenceTest.php',
            '../../scripts/sso-backend-authentication-audit-production-smoke.sh',
            '../../docs/devops/sso-backend-authentication-audit-production-smoke.md',
            '../../.github/workflows/deploy-main.yml',
        ],
    ];
}

/**
 * @return array<string, string>
 */
function fr006_authentication_audit_principles(): array
{
    return [
        'least_privilege' => 'Admin authentication audit access uses a dedicated RBAC permission and menu capability.',
        'data_minimization' => 'Sensitive token-like and protocol values are redacted or hashed before persistence and logs.',
        'immutability' => 'Authentication audit events are append-only and protected from update/delete mutation.',
        'traceability' => 'Events carry request_id, event_id, subject, client, session, outcome, and error correlation fields.',
        'retention' => 'Retention is configurable, bounded, dry-run-capable, and scheduled for compliance operations.',
        'operability' => 'Structured logs and command output provide evidence for production observability.',
    ];
}

/**
 * @return list<string>
 */
function fr006_authentication_audit_ci_tests(): array
{
    return [
        'AuthenticationAuditAggregateCoverageMatrixTest.php',
        'AuthenticationAuditDomainModelTest.php',
        'CentralAuthenticationAuditEventStoreTest.php',
        'LoginSuccessFailureAuditContractTest.php',
        'AuthorizationRequestAuditContractTest.php',
        'TokenLifecycleAuditContractTest.php',
        'TokenRevocationAuditContractTest.php',
        'LogoutAuthenticationAuditContractTest.php',
        'ExternalIdpAuthenticationAuditContractTest.php',
        'AdminAuthenticationAuditApiContractTest.php',
        'AuthenticationAuditPermissionMatrixContractTest.php',
        'AuthenticationAuditRetentionComplianceContractTest.php',
        'AuthenticationAuditObservabilityEvidenceContractTest.php',
        'AuthenticationAuditProductionSmokeEvidenceTest.php',
    ];
}

function fr006_authentication_audit_file(string $relativePath): string
{
    return (string) file_get_contents(base_path($relativePath));
}
