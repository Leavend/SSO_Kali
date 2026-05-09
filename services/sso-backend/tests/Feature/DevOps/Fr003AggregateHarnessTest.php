<?php

declare(strict_types=1);

it('locks the complete fr003 backend aggregate evidence set', function (): void {
    foreach (fr003_aggregate_contracts() as $domain => $files) {
        foreach ($files as $relativePath => $needles) {
            $content = fr003_aggregate_file($relativePath);

            expect($content, "{$domain}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($needles as $needle) {
                expect($content, "{$domain}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

it('keeps every fr003 contract test and harness wired into ci', function (): void {
    $ci = fr003_aggregate_file('../../.github/workflows/ci.yml');

    foreach (fr003_aggregate_ci_tests() as $testName) {
        expect($ci, "CI must run {$testName}")->toContain($testName);
    }
});

it('documents the fr003 admin route surface and least privilege guards', function (): void {
    $routes = fr003_aggregate_file('routes/admin.php');

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

it('keeps route inventory aware of all fr003 public contracts', function (): void {
    $inventory = fr003_aggregate_file('tests/Feature/Routing/RouteInventoryContractTest.php');

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
function fr003_aggregate_contracts(): array
{
    return [
        'issue39_rbac_domain' => [
            'tests/Feature/DevOps/Fr003RbacDomainHarnessTest.php' => ['fr003 rbac domain', 'RbacPolicyContractTest.php'],
            'tests/Feature/Admin/RbacPolicyContractTest.php' => ['canManageUsers', 'canReadAuditTrail'],
            'app/Support/Rbac/AdminPermission.php' => ['USERS_READ', 'AUDIT_READ', 'CLIENTS_WRITE'],
        ],
        'issue40_user_management' => [
            'tests/Feature/DevOps/Fr003UserManagementHarnessTest.php' => ['fr003 user management', 'UserManagementBackendTest.php'],
            'tests/Feature/Admin/UserManagementBackendTest.php' => ['creates local fallback users', 'syncs selected profile fields'],
            'app/Http/Controllers/Admin/UserController.php' => ['create_managed_user', 'deactivate_managed_user'],
        ],
        'issue41_menu_authorization' => [
            'tests/Feature/DevOps/Fr003AdminMenuAuthorizationHarnessTest.php' => ['fr003 admin menu authorization'],
            'tests/Feature/Admin/AdminPermissionMatrixMenuContractTest.php' => ['dashboard', 'audit', 'profile'],
            'app/Services/Admin/AdminPermissionMatrix.php' => ['menusFor', 'capabilitiesFor'],
        ],
        'issue42_admin_management_crud' => [
            'tests/Feature/DevOps/Fr003AdminManagementCrudHarnessTest.php' => ['issue42 admin management crud'],
            'tests/Feature/Admin/RolePermissionManagementBackendTest.php' => ['creates updates syncs and deletes non-system roles'],
            'tests/Feature/Admin/ClientManagementCrudBackendTest.php' => ['updates managed client metadata without exposing or changing secret hashes'],
        ],
        'issue43_scope_claim_enforcement' => [
            'tests/Feature/DevOps/Fr003ScopeManagementHarnessTest.php' => ['issue43 scope management'],
            'tests/Unit/Oidc/ScopePolicyTest.php' => ['rejects unknown requested scopes'],
            'tests/Feature/Oidc/UserClaimsFactoryScopeEnforcementTest.php' => ['emits roles and permissions only when RBAC scopes are granted'],
        ],
        'issue44_user_profile_portal' => [
            'tests/Feature/DevOps/Fr003UserProfilePortalHarnessTest.php' => ['issue44 user profile portal'],
            'tests/Feature/Profile/ProfilePortalBackendContractTest.php' => ['updates only allowed self profile fields'],
            'app/Services/Profile/ProfilePortalPresenter.php' => ['ProfilePortalPresenter', 'OidcScope::PERMISSIONS'],
        ],
        'issue45_admin_audit_trail' => [
            'tests/Feature/DevOps/Fr003AdminAuditTrailHarnessTest.php' => ['issue45 admin audit trail'],
            'tests/Feature/Admin/AdminAuditTrailContractTest.php' => ['verifies audit hash chain integrity'],
            'app/Services/Admin/AdminAuditIntegrityVerifier.php' => ['broken_event_id', 'checked_events'],
        ],
    ];
}

/**
 * @return list<string>
 */
function fr003_aggregate_ci_tests(): array
{
    return [
        'Fr003AggregateHarnessTest.php',
        'Fr003RbacDomainHarnessTest.php',
        'RbacPolicyContractTest.php',
        'AdminPermissionMiddlewareTest.php',
        'Fr003UserManagementHarnessTest.php',
        'UserManagementBackendTest.php',
        'Fr003AdminMenuAuthorizationHarnessTest.php',
        'AdminPermissionMatrixMenuContractTest.php',
        'Fr003AdminManagementCrudHarnessTest.php',
        'RolePermissionManagementBackendTest.php',
        'ClientManagementCrudBackendTest.php',
        'Fr003ScopeManagementHarnessTest.php',
        'ScopePolicyTest.php',
        'UserClaimsFactoryScopeEnforcementTest.php',
        'ClientScopeManagementBackendTest.php',
        'Fr003UserProfilePortalHarnessTest.php',
        'ProfilePortalBackendContractTest.php',
        'Fr003AdminAuditTrailHarnessTest.php',
        'AdminAuditTrailContractTest.php',
    ];
}

function fr003_aggregate_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
