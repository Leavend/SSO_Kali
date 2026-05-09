<?php

declare(strict_types=1);

it('locks adminBackend rbac domain and admin hardening evidence', function (): void {
    $contracts = [
        'adminBackend_rbac_domain_policy_contract' => [
            'tests/Feature/DevOps/AdminRbacDomainEvidenceTest.php' => [
                'adminBackend rbac domain',
                'denies unknown roles by default',
                'RequireAdminPermission.php',
            ],
            'app/Support/Rbac/AdminPermission.php' => [
                'admin.panel.view',
                'admin.sessions.terminate',
                'profile.write',
            ],
            'app/Services/Admin/AdminRbacResolver.php' => [
                'legacyPermissions',
                'default => []',
                'AdminPermission::adminDefaults()',
            ],
        ],
        'adminBackend_user_management_backend' => [
            'tests/Feature/DevOps/AdminUserManagementEvidenceTest.php' => [
                'adminBackend user management',
                'password_reset_token_hash',
                'AdminPermission::USERS_WRITE',
            ],
            'tests/Feature/Admin/UserManagementBackendTest.php' => [
                'creates local fallback users',
                'stores only a password reset token hash',
                'syncs selected profile fields',
            ],
            'app/Http/Controllers/Admin/UserController.php' => [
                'create_managed_user',
                'deactivate_managed_user',
                'sync_managed_user_profile',
            ],
        ],
        'adminBackend_admin_menu_authorization_contract' => [
            'tests/Feature/DevOps/AdminMenuAuthorizationEvidenceTest.php' => [
                'adminBackend admin menu authorization',
                'AdminPermissionMatrixMenuContractTest.php',
                'AdminMenuAuthorizationEvidenceTest.php',
            ],
            'app/Support/Rbac/AdminMenu.php' => [
                "public const DASHBOARD = 'dashboard'",
                'AdminPermission::USERS_READ',
                'AdminPermission::PROFILE_READ',
            ],
            'app/Services/Admin/AdminPermissionMatrix.php' => [
                'capabilitiesFor',
                'menusFor',
                'canViewMenu',
            ],
        ],
        'adminBackend_admin_management_crud_backend' => [
            'tests/Feature/DevOps/AdminManagementCrudEvidenceTest.php' => [
                'issue42 admin management crud',
                'RolePermissionManagementBackendTest.php',
                'ClientManagementCrudBackendTest.php',
            ],
            'app/Http/Controllers/Admin/RoleController.php' => [
                'create_managed_role',
                'sync_role_permissions',
                'sync_user_roles',
            ],
            'app/Services/Admin/AdminClientPresenter.php' => [
                'has_secret_hash',
            ],
        ],
        'adminBackend_scope_management_claim_enforcement' => [
            'tests/Feature/DevOps/AdminScopeManagementEvidenceTest.php' => [
                'issue43 scope management',
                'ScopePolicyTest.php',
                'ClientScopeManagementBackendTest.php',
            ],
            'app/Services/Oidc/ScopePolicy.php' => [
                'validateAuthorizationRequest',
                'assertKnown',
                'assertAllowed',
            ],
            'app/Services/Oidc/UserClaimsFactory.php' => [
                'roleClaims',
                'permissionClaims',
                'OidcScope::PERMISSIONS',
            ],
        ],
        'adminBackend_user_profile_portal_backend_contract' => [
            'tests/Feature/DevOps/UserProfilePortalEvidenceTest.php' => [
                'issue44 user profile portal',
                'ProfilePortalBackendContractTest.php',
            ],
            'app/Services/Profile/ProfilePortalPresenter.php' => [
                'ProfilePortalPresenter',
                'OidcScope::PROFILE',
                'OidcScope::PERMISSIONS',
            ],
            'app/Actions/Profile/UpdateProfilePortalAction.php' => [
                'PROFILE_SELF_UPDATE',
                'changed_fields',
                'editableFields',
            ],
        ],
        'adminBackend_admin_audit_trail_contract' => [
            'tests/Feature/DevOps/AdminAuditTrailEvidenceTest.php' => [
                'issue45 admin audit trail',
                'AdminAuditTrailContractTest.php',
            ],
            'app/Services/Admin/AdminAuditIntegrityVerifier.php' => [
                'broken_event_id',
                'checked_events',
            ],
            'app/Http/Controllers/Admin/AuditTrailController.php' => [
                'function index',
                'function show',
                'function integrity',
            ],
        ],
        'adminBackend_aggregate_harness' => [
            'tests/Feature/DevOps/AdminBackendCoverageEvidenceTest.php' => [
                'locks the complete adminBackend backend aggregate evidence set',
                'issue45_admin_audit_trail',
                'adminBackend_aggregate_ci_tests',
            ],
        ],
        'oidcBackend_oidc_backend_aggregate_harness' => [
            'tests/Feature/DevOps/OidcBackendCoverageEvidenceTest.php' => [
                'locks the complete oidcBackend oidc backend aggregate evidence set',
                'maps oidcBackend use cases uc01 through uc23',
                'oidcBackend_use_case_coverage',
            ],
            'tests/Feature/Oidc/AuthorizationCodeFlowE2EContractTest.php' => [
                'public client authorization code flow',
                'confidential client secret',
                'single use code',
            ],
            'tests/Feature/Oidc/TokenEndpointHardeningContractTest.php' => [
                'invalid grants',
                'client secret',
                'unsupported grant types',
            ],
            'tests/Feature/Oidc/JwtValidationClaimContractTest.php' => [
                'production jwt claims',
                'scope-bound profile claims',
                'alg none tokens',
            ],
            'tests/Feature/Oidc/RefreshTokenRotationReplayContractTest.php' => [
                'rotates refresh tokens',
                'replay',
                'token family',
            ],
            'tests/Feature/Oidc/RevocationEndpointRfc7009ContractTest.php' => [
                'rfc7009',
                'token_type_hint',
                'idempotent',
            ],
            'tests/Feature/Oidc/UserInfoEndpointClaimsContractTest.php' => [
                'valid bearer access token',
                'scope-bound',
                'invalid_token',
            ],
            'tests/Feature/Oidc/OidcIncidentAuditLoggingContractTest.php' => [
                'oidc.security_incident',
                'redacted',
                'chained',
            ],
            'tests/Feature/Oidc/ConsentFlowContractTest.php' => [
                'prompt none',
                'login_required',
                'select_account',
            ],
            'tests/Feature/Profile/ConnectedAppsSelfServiceRevocationContractTest.php' => [
                'connected_apps',
                'profile.connected_app_revoked',
                'revoked_refresh_tokens',
            ],
            'tests/Feature/DevOps/OidcProductionSmokeEvidenceTest.php' => [
                'OIDC Backend production smoke',
                'error=login_required',
                'error=invalid_request',
            ],
        ],
    ];

    foreach ($contracts as $issue => $files) {
        foreach ($files as $relativePath => $requiredNeedles) {
            $content = admin_hardening_file_contents($relativePath);

            expect($content, "{$issue}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($requiredNeedles as $needle) {
                expect($content, "{$issue}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

function admin_hardening_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
