<?php

declare(strict_types=1);

it('locks oidcBackend oidc backend aggregate and logout hardening evidence', function (): void {
    $contracts = [
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
            'routes/oidc.php' => [
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
            $content = oidc_hardening_file_contents($relativePath);

            expect($content, "{$issue}: {$relativePath} must exist")->toBeString()->not->toBe('');

            foreach ($requiredNeedles as $needle) {
                expect($content, "{$issue}: {$relativePath} must contain {$needle}")->toContain($needle);
            }
        }
    }
});

function oidc_hardening_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
