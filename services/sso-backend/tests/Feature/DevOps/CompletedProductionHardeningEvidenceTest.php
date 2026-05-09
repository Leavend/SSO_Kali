<?php

declare(strict_types=1);

it('locks completed production hardening issues into a single executable contract', function (): void {
    $contracts = [
        'issue_32_runtime_verification' => [
            'tests/Feature/DevOps/RuntimeAfterTopologyChangeEvidenceTest.php' => [
                'sso-backend-worker',
                'sso-admin-vue',
                'sso-backend-vps-smoke.sh',
            ],
            '../../scripts/sso-backend-vps-smoke.sh' => [
                'verify_topology',
                'verify_worker_logs',
                'docker-compose.main.yml',
            ],
        ],
        'issue_6_observability_audit' => [
            'tests/Feature/System/ReadinessObservabilityTest.php' => ['queue'],
            'tests/Feature/System/RequestLifecycleObservabilityTest.php' => [
                'X-Request-Id',
                'sso.request_timing',
                'memory_peak_mb',
            ],
            'tests/Feature/System/QueueMetricsControllerTest.php' => ['/_internal/queue-metrics'],
            'tests/Feature/DevOps/WorkerBootObservabilityEvidenceTest.php' => ['sso.worker_boot'],
            '../../docs/devops/sso-backend-queue-operations.md' => [
                'queue:retry',
                'Do not run docker system prune',
            ],
        ],
        'issue_7_backup_restore' => [
            'tests/Feature/DevOps/BackupRestoreRunbookEvidenceTest.php' => ['restore rehearsal'],
            '../../docs/devops/sso-backend-backup-restore.md' => [
                'docker-compose.main.yml',
                'sha256sum -c SHA256SUMS',
                'sso-backend-vps-smoke.sh',
            ],
        ],
        'issue_9_security_hardening' => [
            'tests/Feature/DevOps/SecurityHardeningChecklistEvidenceTest.php' => ['Penetration-Style Checklist'],
            '../../docs/security/sso-backend-production-checklist.md' => [
                'APP_DEBUG=false',
                'SSO_INTERNAL_QUEUE_METRICS_ENABLED=false',
                'No wildcard production redirect URIs',
                'Do not run docker system prune',
            ],
        ],
        'issue_8_github_actions_deploy' => [
            'tests/Feature/DevOps/GitHubActionsProductionDeployEvidenceTest.php' => ['docker-compose.main.yml'],
            '../../.github/workflows/sso-backend-deploy.yml' => [
                'environment: production',
                'docker-compose.main.yml',
                'scripts/vps-deploy-main.sh',
            ],
        ],
        'issue_4_locked_client_registry' => [
            'tests/Feature/Oidc/LockedProductionClientRegistryTest.php' => ['unexpected production client'],
            'app/Actions/Oidc/ValidateProductionOidcClientRegistryAction.php' => [
                'locked_production_client_ids',
                'unexpected production client',
                'missing locked production client',
            ],
            'config/oidc_clients.php' => ['locked_production_client_ids'],
        ],
        'issue_27_29_28_logoutFlow_backend_hardening' => [
            'tests/Feature/Oidc/BackChannelLogoutAcceptanceTest.php' => [
                'structured success audit',
                'non success client responses',
                'insecure production logout uri',
            ],
            'tests/Feature/Oidc/BackChannelLogoutPartialFailureContractTest.php' => [
                'partial queue dispatch failures',
                'queue_dispatch_failed',
            ],
            'app/Actions/Audit/RecordLogoutAuditEventAction.php' => [
                'logout_channel',
                'request_id',
                'authorization',
                'cookie',
            ],
            'app/Services/Oidc/BackChannelLogoutDispatcher.php' => [
                'queuedResult',
                'failedResult',
                'queue_dispatch_failed',
            ],
            'app/Jobs/DispatchBackChannelLogoutJob.php' => [
                'uri_policy_violation',
                'non_success_response',
                'backchannel_logout_succeeded',
            ],
        ],
        'backchannel_logout_operational_drill' => [
            'tests/Feature/Oidc/BackChannelLogoutOperationalDrillTest.php' => [
                'downstream outage is retryable auditable and secret-safe',
                'blocked before network delivery',
                'sanitized operational audit trail',
            ],
            'app/Jobs/DispatchBackChannelLogoutJob.php' => [
                'backchannel-logout',
                'uri_policy_violation',
                'non_success_response',
            ],
        ],
        'issue_20_frontchannel_logout_backend_flow' => [
            'tests/Feature/Oidc/FrontChannelLogoutFlowTest.php' => [
                'post logout uri',
                'id token hint audience',
                'centralized logout backward compatible',
            ],
            'app/Actions/Oidc/PerformFrontChannelLogout.php' => [
                'allowsPostLogoutRedirectUri',
                'frontchannel_logout_completed',
                'post_logout_redirect_uri',
            ],
            'routes/web.php' => [
                "Route::match(['get', 'post'], '/connect/logout'",
            ],
        ],
        'issue_30_oauth_load_test_client' => [
            'tests/Feature/Oidc/LoadTestClientRegistryTest.php' => [
                'absent by default',
                'sso-load-test-client',
                'hashed secret',
            ],
            'config/oidc_clients.php' => [
                'SSO_LOAD_TEST_CLIENT_ENABLED',
                'SSO_LOAD_TEST_CLIENT_SECRET_HASH',
                'load_test_client',
            ],
            '../../docs/devops/sso-backend-oauth-load-test.md' => [
                'client_credentials',
                'SSO_LOAD_TEST_CLIENT_SECRET_HASH',
                'Never commit a plaintext',
            ],
        ],
        'issue_31_backend_only_production_lifecycle' => [
            'tests/Feature/DevOps/BackendOnlyProductionLifecycleContractTest.php' => [
                'backend-only',
                'sso-backend-deploy',
                'sso-backend-prod',
            ],
            '../../docs/devops/sso-backend-production-lifecycle.md' => [
                'legacy services intentionally excluded',
                'sso-backend-prod',
                'ghcr.io/leavend/sso-kali',
            ],
            '../../.github/workflows/deploy-main.yml' => [
                'sso-backend-deploy',
                'COMPOSE_PROJECT_NAME: sso-backend-prod',
            ],
        ],
        'production_public_domain_smoke' => [
            'tests/Feature/DevOps/ProductionPublicDomainSmokeEvidenceTest.php' => [
                'public-domain production smoke',
                'api-sso.timeh.my.id',
                'sso.timeh.my.id',
            ],
            '../../scripts/sso-backend-public-smoke.sh' => [
                '/.well-known/openid-configuration',
                '/.well-known/jwks.json',
                'cache-control',
            ],
            '../../docs/devops/sso-backend-production-smoke.md' => [
                'No secrets are required',
                'Evidence to retain',
                'https://api-sso.timeh.my.id',
            ],
        ],
        'push_triggered_deploy_lifecycle' => [
            'tests/Feature/DevOps/PushTriggeredDeployLifecycleEvidenceTest.php' => [
                'push-triggered deploy-main',
                'StrictHostKeyChecking=accept-new',
                'VPS_SSH_KNOWN_HOSTS',
            ],
            '../../.github/workflows/deploy-main.yml' => [
                'push:',
                'branches: [main]',
                'ssh-keyscan attempt ${attempt} failed',
            ],
        ],
        'production_oauth_token_flow_smoke' => [
            'tests/Feature/DevOps/ProductionOAuthTokenFlowSmokeEvidenceTest.php' => [
                'oauth token-flow smoke',
                'sso-load-test-client',
                'without committing plaintext secrets',
            ],
            '../../scripts/sso-backend-oauth-token-smoke.sh' => [
                'grant_type=client_credentials',
                'invalid client secret rejected as expected',
                'without printing secrets or tokens',
            ],
            '../../docs/devops/sso-backend-oauth-token-smoke.md' => [
                'No secrets are committed to git',
                'refresh_token absent',
                'SSO_LOAD_TEST_CLIENT_ENABLED=false',
            ],
        ],
        'production_metadata_jwks_wrk_smoke' => [
            'tests/Feature/DevOps/ProductionMetadataWrkSmokeEvidenceTest.php' => [
                'metadata and jwks wrk smoke',
                'PASS with warning',
                'Nginx worker_connections',
            ],
            '../../scripts/sso-backend-metadata-wrk-smoke.sh' => [
                '/.well-known/openid-configuration',
                '/.well-known/jwks.json',
                'wrk-results/sso-backend-metadata',
            ],
            '../../docs/devops/sso-backend-metadata-wrk-smoke.md' => [
                '2008.82',
                '2013.64',
                '1737.55',
            ],
        ],
        'production_connection_tuning' => [
            'tests/Feature/DevOps/ProductionConnectionTuningEvidenceTest.php' => [
                'connection pressure tuning',
                'worker_connections 4096',
                'proxy_http_version 1.1',
            ],
            '../../scripts/vps-apply-sso-connection-tuning.sh' => [
                '--mode audit|apply',
                'nginx -t',
                'pre-sso-connection-tuning',
            ],
            '../../docs/devops/sso-backend-connection-tuning.md' => [
                'PASS with warning',
                'Rollback',
                'scripts/sso-backend-metadata-wrk-smoke.sh',
            ],
        ],
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
            'app/Http/Controllers/Admin/ClientController.php' => [
                'function show',
                'function update',
                'function destroy',
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
        'externalIdp_external_idp_registry_domain_model' => [
            'tests/Feature/DevOps/ExternalIdpCoverageEvidenceTest.php' => [
                'complete externalIdp external idp aggregate evidence set',
                'maps externalIdp aggregate coverage to implementation domains',
                'keeps every externalIdp aggregate dependency wired into ci',
                'UC-08',
                'UC-50',
            ],
            'tests/Feature/ExternalIdp/ExternalIdentityProviderRegistryContractTest.php' => [
                'secure production defaults',
                'rejects non-https',
                'tamper-evident audit evidence',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpDiscoveryContractTest.php' => [
                'fetches validates caches',
                'rejects issuer mismatch',
                'uses stale discovery cache',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpJwksContractTest.php' => [
                'fetches validates caches and resolves',
                'rejects non-https jwks uri unknown kid alg none',
                'uses stale jwks cache',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpAuthenticationRedirectContractTest.php' => [
                'OIDC conformant external idp authorization redirect',
                'rejects disabled unhealthy and non-https',
                'audits external idp auth redirect success and failure',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpCallbackTokenExchangeContractTest.php' => [
                'exchanges an external idp callback authorization code',
                'rejects invalid replayed state and non-https token endpoint',
                'rejects issuer nonce algorithm and kid validation failures',
                'audits callback token exchange success and failure',
            ],
            'tests/Feature/ExternalIdp/ExternalSubjectAccountMappingContractTest.php' => [
                'creates a new local external user',
                'links verified external subject to an existing local account',
                'prevents email takeover',
                'audits account mapping success and failure',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpFailoverPolicyContractTest.php' => [
                'selects the highest priority healthy primary provider',
                'fails over to the highest priority backup provider',
                'fails closed when every external idp provider is unavailable',
                'deterministic provider key ordering',
                'excludes disabled and unhealthy providers',
                'audits failover selection success and unavailable failure',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpHealthReadinessContractTest.php' => [
                'marks an enabled external idp healthy',
                'marks external idp unhealthy',
                'does not perform network probe for disabled',
                'keeps readiness endpoint shallow',
                'audits health probe success and failure',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpClaimsMappingContractTest.php' => [
                'maps default oidc claims',
                'maps custom nested claims',
                'rejects missing required custom claims',
                'integrates raw claims mapping',
                'audits claims mapping success and failure',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpSecurityIncidentAuditContractTest.php' => [
                'records centralized external idp security incidents',
                'records auth redirect failure',
                'records callback exchange failure',
                'records account link takeover protection failure',
                'keeps external idp security incident audit events hash chained',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpDiscoverySignatureContractTest.php' => [
                'enforces https issuer aligned discovery endpoints',
                'persists trusted discovery metadata only after issuer',
                'accepts only allowed rs256 signed id tokens',
                'rejects unsigned disallowed algorithm unknown kid',
            ],
            'tests/Feature/ExternalIdp/ExternalIdpLoginE2EContractTest.php' => [
                'completes external idp login from provider selection',
                'keeps external idp login idempotent',
                'fails closed when external idp login callback uses replayed state',
                'audits external idp login lifecycle without leaking callback tokens',
            ],
            'tests/Feature/DevOps/ExternalIdpProductionSmokeEvidenceTest.php' => [
                'externalIdp production smoke secret-free',
                'RUN_FR005_PRODUCTION_SMOKE',
                'sso-backend-external-idp-production-smoke.sh',
            ],
            '../../scripts/sso-backend-external-idp-production-smoke.sh' => [
                'https://api-sso.timeh.my.id',
                'external_idps',
                'External IdP production smoke completed successfully without secrets or tokens',
            ],
            '../../docs/devops/sso-backend-external-idp-production-smoke.md' => [
                'RUN_FR005_PRODUCTION_SMOKE=true',
                'Evidence to Retain',
                'without secrets or tokens',
            ],
            'tests/Feature/Admin/ExternalIdentityProviderCrudContractTest.php' => [
                'enforces external idp admin CRUD validation boundaries',
                'without leaking secrets',
                'preserves existing client secret',
                'writes hash chained redacted audit events',
            ],
            'tests/Feature/Admin/ExternalIdentityProviderManagementTest.php' => [
                'creates updates lists shows and deletes external idps',
                'validates admin external idp request contracts',
                'writes redacted admin audit events',
            ],
            'tests/Feature/Admin/ExternalIdentityProviderPermissionMatrixTest.php' => [
                'explicit read and write permissions',
                'dedicated external idps menu',
                'step-up and mfa policy',
            ],
        ],
    ];

    foreach ($contracts as $issue => $files) {
        foreach ($files as $relativePath => $requiredNeedles) {
            $content = issue_hardening_file_contents($relativePath);

            expect($content, "{$issue}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($requiredNeedles as $needle) {
                expect($content, "{$issue}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

it('keeps completed hardening harnesses wired into root CI', function (): void {
    $ci = issue_hardening_file_contents('../../.github/workflows/ci.yml');

    foreach ([
        'RuntimeAfterTopologyChangeEvidenceTest.php',
        'ReadinessObservabilityTest.php',
        'RequestLifecycleObservabilityTest.php',
        'QueueMetricsControllerTest.php',
        'WorkerBootObservabilityEvidenceTest.php',
        'QueueOperationsRunbookEvidenceTest.php',
        'BackupRestoreRunbookEvidenceTest.php',
        'SecurityHardeningChecklistEvidenceTest.php',
        'GitHubActionsProductionDeployEvidenceTest.php',
        'PushTriggeredDeployLifecycleEvidenceTest.php',
        'ProductionOAuthTokenFlowSmokeEvidenceTest.php',
        'ProductionMetadataWrkSmokeEvidenceTest.php',
        'ProductionConnectionTuningEvidenceTest.php',
        'OidcBackendCoverageEvidenceTest.php',
        'AuthorizationCodeFlowE2EContractTest.php',
        'ConsentFlowContractTest.php',
        'ConnectedAppsSelfServiceRevocationContractTest.php',
        'OidcProductionSmokeEvidenceTest.php',
        'ExternalIdpCoverageEvidenceTest.php',
        'ExternalIdentityProviderRegistryContractTest.php',
        'ExternalIdpDiscoveryContractTest.php',
        'ExternalIdpJwksContractTest.php',
        'ExternalIdpAuthenticationRedirectContractTest.php',
        'ExternalIdpCallbackTokenExchangeContractTest.php',
        'ExternalSubjectAccountMappingContractTest.php',
        'ExternalIdpFailoverPolicyContractTest.php',
        'ExternalIdpHealthReadinessContractTest.php',
        'ExternalIdpClaimsMappingContractTest.php',
        'ExternalIdpSecurityIncidentAuditContractTest.php',
        'ExternalIdpDiscoverySignatureContractTest.php',
        'ExternalIdpLoginE2EContractTest.php',
        'ExternalIdpProductionSmokeEvidenceTest.php',
        'ExternalIdentityProviderCrudContractTest.php',
        'ExternalIdentityProviderManagementTest.php',
        'ExternalIdentityProviderPermissionMatrixTest.php',
        'TokenEndpointHardeningContractTest.php',
        'JwtValidationClaimContractTest.php',
        'RefreshTokenRotationReplayContractTest.php',
        'RevocationEndpointRfc7009ContractTest.php',
        'UserInfoEndpointClaimsContractTest.php',
        'OidcIncidentAuditLoggingContractTest.php',
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
        'ProductionPublicDomainSmokeEvidenceTest.php',
        'LogoutAuditRedactionEvidenceTest.php',
        'BackChannelLogoutReliabilityEvidenceTest.php',
        'OAuthLoadTestClientEvidenceTest.php',
        'BackendProductionLifecycleEvidenceTest.php',
        'LockedProductionClientRegistryTest.php',
        'ProductionClientRegistryTest.php',
        'BackChannelLogoutAcceptanceTest.php',
        'BackChannelLogoutPartialFailureContractTest.php',
        'BackChannelLogoutOperationalDrillTest.php',
        'FrontChannelLogoutFlowTest.php',
        'LoadTestClientRegistryTest.php',
        'BackendOnlyProductionLifecycleContractTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue_hardening_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
