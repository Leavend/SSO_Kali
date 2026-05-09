<?php

declare(strict_types=1);

it('locks the complete adminBackend backend aggregate evidence set', function (): void {
    foreach (adminBackend_aggregate_contracts() as $domain => $files) {
        foreach ($files as $relativePath => $needles) {
            $content = adminBackend_aggregate_file($relativePath);

            expect($content, "{$domain}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($needles as $needle) {
                expect($content, "{$domain}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

it('keeps every adminBackend contract test and harness wired into ci', function (): void {
    $ci = adminBackend_aggregate_file('../../.github/workflows/ci.yml');

    foreach (adminBackend_aggregate_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

it('documents the adminBackend admin route surface and least privilege guards', function (): void {
    $routes = adminBackend_aggregate_file('routes/admin.php');

    foreach ([
        "Route::get('/users'",
        "Route::post('/users'",
        "Route::get('/roles'",
        "Route::post('/roles'",
        "Route::get('/clients'",
        "Route::patch('/clients/{clientId}'",
        "Route::get('/scopes'",
        "Route::get('/audit/events'",
        "Route::get('/audit/integrity'",
        'AdminPermission::USERS_WRITE',
        'AdminPermission::ROLES_WRITE',
        'AdminPermission::CLIENTS_WRITE',
        'AdminPermission::AUDIT_READ',
        'EnsureFreshAdminAuth::class',
        'EnsureAdminMfaAssurance::class',
    ] as $needle) {
        expect($routes)->toContain($needle);
    }
});

it('keeps route inventory aware of all adminBackend public contracts', function (): void {
    $inventory = adminBackend_aggregate_file('tests/Feature/Routing/RouteInventoryContractTest.php');

    foreach ([
        'GET|HEAD admin/api/users',
        'POST admin/api/users',
        'PUT admin/api/users/{subjectId}/roles',
        'GET|HEAD admin/api/roles',
        'POST admin/api/roles',
        'GET|HEAD admin/api/clients',
        'PATCH admin/api/clients/{clientId}',
        'PUT admin/api/clients/{clientId}/scopes',
        'GET|HEAD admin/api/scopes',
        'GET|HEAD api/profile',
        'PATCH api/profile',
        'GET|HEAD admin/api/audit/events',
        'GET|HEAD admin/api/audit/integrity',
    ] as $signature) {
        expect($inventory)->toContain($signature);
    }
});

/**
 * @return array<string, array<string, list<string>>>
 */
function adminBackend_aggregate_contracts(): array
{
    return [
        'issue39_rbac_domain' => [
            'tests/Feature/DevOps/AdminRbacDomainEvidenceTest.php' => ['adminBackend rbac domain', 'RbacPolicyContractTest.php'],
            'tests/Feature/Admin/RbacPolicyContractTest.php' => ['canManageUsers', 'canReadAuditTrail'],
            'app/Support/Rbac/AdminPermission.php' => ['USERS_READ', 'AUDIT_READ', 'CLIENTS_WRITE'],
        ],
        'issue40_user_management' => [
            'tests/Feature/DevOps/AdminUserManagementEvidenceTest.php' => ['adminBackend user management', 'UserManagementBackendTest.php'],
            'tests/Feature/Admin/UserManagementBackendTest.php' => ['creates local fallback users', 'syncs selected profile fields'],
            'app/Http/Controllers/Admin/UserController.php' => ['create_managed_user', 'deactivate_managed_user'],
        ],
        'issue41_menu_authorization' => [
            'tests/Feature/DevOps/AdminMenuAuthorizationEvidenceTest.php' => ['adminBackend admin menu authorization'],
            'tests/Feature/Admin/AdminPermissionMatrixMenuContractTest.php' => ['dashboard', 'audit', 'profile'],
            'app/Services/Admin/AdminPermissionMatrix.php' => ['menusFor', 'capabilitiesFor'],
        ],
        'issue42_admin_management_crud' => [
            'tests/Feature/DevOps/AdminManagementCrudEvidenceTest.php' => ['issue42 admin management crud'],
            'tests/Feature/Admin/RolePermissionManagementBackendTest.php' => ['creates updates syncs and deletes non-system roles'],
            'tests/Feature/Admin/ClientManagementCrudBackendTest.php' => ['updates managed client metadata without exposing or changing secret hashes'],
        ],
        'issue43_scope_claim_enforcement' => [
            'tests/Feature/DevOps/AdminScopeManagementEvidenceTest.php' => ['issue43 scope management'],
            'tests/Unit/Oidc/ScopePolicyTest.php' => ['rejects unknown requested scopes'],
            'tests/Feature/Oidc/UserClaimsFactoryScopeEnforcementTest.php' => ['emits roles and permissions only when RBAC scopes are granted'],
        ],
        'issue44_user_profile_portal' => [
            'tests/Feature/DevOps/UserProfilePortalEvidenceTest.php' => ['issue44 user profile portal'],
            'tests/Feature/Profile/ProfilePortalBackendContractTest.php' => ['updates only allowed self profile fields'],
            'app/Services/Profile/ProfilePortalPresenter.php' => ['ProfilePortalPresenter', 'OidcScope::PERMISSIONS'],
        ],
        'issue45_admin_audit_trail' => [
            'tests/Feature/DevOps/AdminAuditTrailEvidenceTest.php' => ['issue45 admin audit trail'],
            'tests/Feature/Admin/AdminAuditTrailContractTest.php' => ['verifies audit hash chain integrity'],
            'app/Services/Admin/AdminAuditIntegrityVerifier.php' => ['broken_event_id', 'checked_events'],
        ],
    ];
}

/**
 * @return list<string>
 */
function adminBackend_aggregate_ci_tests(): array
{
    return [
        'AdminBackendCoverageEvidenceTest.php',
        'AdminRbacDomainEvidenceTest.php',
        'RbacPolicyContractTest.php',
        'AdminPermissionMiddlewareTest.php',
        'AdminUserManagementEvidenceTest.php',
        'UserManagementBackendTest.php',
        'AdminMenuAuthorizationEvidenceTest.php',
        'AdminPermissionMatrixMenuContractTest.php',
        'AdminManagementCrudEvidenceTest.php',
        'RolePermissionManagementBackendTest.php',
        'ClientManagementCrudBackendTest.php',
        'AdminScopeManagementEvidenceTest.php',
        'ScopePolicyTest.php',
        'UserClaimsFactoryScopeEnforcementTest.php',
        'ClientScopeManagementBackendTest.php',
        'UserProfilePortalEvidenceTest.php',
        'ProfilePortalBackendContractTest.php',
        'AdminAuditTrailEvidenceTest.php',
        'AdminAuditTrailContractTest.php',
    ];
}

function adminBackend_aggregate_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
