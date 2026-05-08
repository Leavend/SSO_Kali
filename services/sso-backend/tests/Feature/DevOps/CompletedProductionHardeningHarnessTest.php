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
        'LockedProductionClientRegistryTest.php',
        'ProductionClientRegistryTest.php',
        'BackChannelLogoutAcceptanceTest.php',
        'BackChannelLogoutPartialFailureContractTest.php',
        'FrontChannelLogoutFlowTest.php',
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
