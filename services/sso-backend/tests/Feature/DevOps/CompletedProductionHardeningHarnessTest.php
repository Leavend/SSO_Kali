<?php

declare(strict_types=1);

it('locks completed production hardening issues into a single executable contract', function (): void {
    $contracts = [
        'issue_32_runtime_verification' => [
            'tests/Feature/DevOps/RuntimeAfterTopologyChangeHarnessTest.php' => [
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
            'tests/Feature/DevOps/WorkerBootObservabilityHarnessTest.php' => ['sso.worker_boot'],
            '../../docs/devops/sso-backend-queue-operations.md' => [
                'queue:retry',
                'Do not run docker system prune',
            ],
        ],
        'issue_7_backup_restore' => [
            'tests/Feature/DevOps/BackupRestoreRunbookHarnessTest.php' => ['restore rehearsal'],
            '../../docs/devops/sso-backend-backup-restore.md' => [
                'docker-compose.main.yml',
                'sha256sum -c SHA256SUMS',
                'sso-backend-vps-smoke.sh',
            ],
        ],
        'issue_9_security_hardening' => [
            'tests/Feature/DevOps/SecurityHardeningChecklistHarnessTest.php' => ['Penetration-Style Checklist'],
            '../../docs/security/sso-backend-production-checklist.md' => [
                'APP_DEBUG=false',
                'SSO_INTERNAL_QUEUE_METRICS_ENABLED=false',
                'No wildcard production redirect URIs',
                'Do not run docker system prune',
            ],
        ],
        'issue_8_github_actions_deploy' => [
            'tests/Feature/DevOps/GitHubActionsProductionDeployHarnessTest.php' => ['docker-compose.main.yml'],
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
        'issue_27_29_28_fr002_backend_hardening' => [
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
            'tests/Feature/DevOps/ProductionPublicDomainSmokeHarnessTest.php' => [
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
            'tests/Feature/DevOps/PushTriggeredDeployLifecycleHarnessTest.php' => [
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
            'tests/Feature/DevOps/ProductionOAuthTokenFlowSmokeHarnessTest.php' => [
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
            'tests/Feature/DevOps/ProductionMetadataWrkSmokeHarnessTest.php' => [
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
            'tests/Feature/DevOps/ProductionConnectionTuningHarnessTest.php' => [
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
        'fr003_rbac_domain_policy_contract' => [
            'tests/Feature/DevOps/Fr003RbacDomainHarnessTest.php' => [
                'fr003 rbac domain',
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
        'fr003_user_management_backend' => [
            'tests/Feature/DevOps/Fr003UserManagementHarnessTest.php' => [
                'fr003 user management',
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
        'fr003_admin_menu_authorization_contract' => [
            'tests/Feature/DevOps/Fr003AdminMenuAuthorizationHarnessTest.php' => [
                'fr003 admin menu authorization',
                'AdminPermissionMatrixMenuContractTest.php',
                'Fr003AdminMenuAuthorizationHarnessTest.php',
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
        'RuntimeAfterTopologyChangeHarnessTest.php',
        'ReadinessObservabilityTest.php',
        'RequestLifecycleObservabilityTest.php',
        'QueueMetricsControllerTest.php',
        'WorkerBootObservabilityHarnessTest.php',
        'QueueOperationsRunbookHarnessTest.php',
        'BackupRestoreRunbookHarnessTest.php',
        'SecurityHardeningChecklistHarnessTest.php',
        'GitHubActionsProductionDeployHarnessTest.php',
        'PushTriggeredDeployLifecycleHarnessTest.php',
        'ProductionOAuthTokenFlowSmokeHarnessTest.php',
        'ProductionMetadataWrkSmokeHarnessTest.php',
        'ProductionConnectionTuningHarnessTest.php',
        'Fr003RbacDomainHarnessTest.php',
        'RbacPolicyContractTest.php',
        'AdminPermissionMiddlewareTest.php',
        'Fr003UserManagementHarnessTest.php',
        'UserManagementBackendTest.php',
        'Fr003AdminMenuAuthorizationHarnessTest.php',
        'AdminPermissionMatrixMenuContractTest.php',
        'ProductionPublicDomainSmokeHarnessTest.php',
        'LogoutAuditRedactionHarnessTest.php',
        'BackChannelLogoutReliabilityHarnessTest.php',
        'OAuthLoadTestClientHarnessTest.php',
        'BackendOnlyProductionLifecycleHarnessTest.php',
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
