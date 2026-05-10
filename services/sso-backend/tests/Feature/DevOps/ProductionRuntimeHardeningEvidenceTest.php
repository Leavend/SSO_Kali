<?php

declare(strict_types=1);

it('locks runtime verification and production devops hardening evidence', function (): void {
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
        'production_performance_hardening_po1_po5' => [
            'tests/Feature/DevOps/ProductionPerformanceHardeningEvidenceTest.php' => [
                'protect internal metrics',
                'edge static liveness',
                'scaling readiness',
            ],
            '../../deploy/nginx/nginx-sso-backend-edge.conf' => [
                'location = /_internal/performance-metrics',
                'location = /_internal/queue-metrics',
                'deny all;',
                'proxy_cache_lock on;',
            ],
            '../../docs/devops/sso-backend-production-performance-hardening.md' => [
                'Operational Route Optimization Matrix',
                'High-RPS public operational group',
                '--scale sso-backend=2',
            ],
        ],
        'advanced_operational_route_optimization' => [
            'tests/Feature/DevOps/ProductionOperationalRoutesOptimizationEvidenceTest.php' => [
                'optimizes health as an edge static operational route',
                'microcaches readiness',
                'active VPS apply script',
            ],
            '../../scripts/vps-apply-sso-operational-route-optimization.sh' => [
                '--mode audit|apply',
                'sso_operational_routes',
                'nginx -t',
            ],
            'app/Services/System/ReadinessProbeService.php' => [
                'readiness_queue_snapshot_enabled',
                'readiness_external_idp_snapshot_enabled',
            ],
        ],
    ];

    foreach ($contracts as $issue => $files) {
        foreach ($files as $relativePath => $requiredNeedles) {
            $content = runtime_hardening_file_contents($relativePath);

            expect($content, "{$issue}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($requiredNeedles as $needle) {
                expect($content, "{$issue}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

function runtime_hardening_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
