<?php

declare(strict_types=1);

it('maps issues one through eight to explicit regression tests', function (): void {
    $evidence = [
        'issue_1_delete_connected_apps_csrf_api_semantics' => [
            'file' => 'tests/Feature/Profile/ConnectedAppsSelfServiceRevocationContractTest.php',
            'must_contain' => [
                'keeps connected app revocation exempt from web csrf before bearer authentication',
                "'api/profile/connected-apps/*'",
                'allows users to revoke one connected app without revoking other clients',
            ],
        ],
        'issue_2_auth_profile_k6_accepts_401_or_429' => [
            'file' => 'tests/Stress/sso_valid_profile_prod_stress.js',
            'must_contain' => [
                '[200, 401, 429].includes(r.status)',
                'valid profile is not 5xx',
                'valid connected apps is not 5xx',
            ],
        ],
        'issue_3_auth_profile_method_guards' => [
            'file' => 'tests/Feature/DevOps/OperationalRoutesDevOpsLifecycleEvidenceTest.php',
            'must_contain' => [
                'rejects invalid auth and profile api methods at the nginx edge',
                'auth_profile_method_guard_locations',
                'location ~ ^/api/profile/connected-apps/[^/]+$',
            ],
        ],
        'issue_4_latency_correlation_observability' => [
            'file' => 'tests/Feature/System/RequestLifecycleObservabilityTest.php',
            'must_contain' => [
                'client_ip_hash',
                'user_agent_hash',
                'content_length',
                'query_count',
                'sampled',
            ],
        ],
        'issue_5_dedicated_stress_identity' => [
            'file' => 'tests/Feature/System/ProvisionStressIdentityCommandTest.php',
            'must_contain' => [
                'provisions a dedicated production stress user without exposing plaintext secrets',
                'keeps stress identity provisioning idempotent',
                'usr_stress_sso_prod',
            ],
        ],
        'issue_6_valid_token_stress_profile' => [
            'file' => 'tests/Feature/System/IssueStressTokenCommandTest.php',
            'must_contain' => [
                'issues a short lived bearer token for the dedicated stress identity only',
                'refuses to issue stress tokens for non stress identities',
                'STRESS_ACCESS_TOKEN=',
            ],
        ],
        'issue_7_capacity_tuning_scaling' => [
            'file' => 'tests/Feature/DevOps/ProductionConnectionTuningEvidenceTest.php',
            'must_contain' => [
                'keeps local frankenphp compose capacity aligned with production worker defaults',
                'SSO_BACKEND_OCTANE_WORKERS: "auto"',
                'SSO_BACKEND_OCTANE_MAX_REQUESTS: "1000"',
            ],
        ],
        'issue_8_profile_protected_route_burst_latency' => [
            'file' => 'tests/Feature/Profile/ProfilePortalBackendContractTest.php',
            'must_contain' => [
                'uses a dedicated profile api throttle bucket for burst isolation',
                'throttle:profile-api',
                'DELETE api/profile/connected-apps/{clientId}',
            ],
        ],
    ];

    foreach ($evidence as $issue => $contract) {
        $content = tddEvidenceFile((string) $contract['file']);

        foreach ($contract['must_contain'] as $expected) {
            expect($content, $issue)->toContain($expected);
        }
    }
});

function tddEvidenceFile(string $relativePath): string
{
    $candidate = base_path($relativePath);

    if (! is_file($candidate)) {
        $candidate = dirname(base_path(), 3).DIRECTORY_SEPARATOR.ltrim($relativePath, '/');
    }

    expect($candidate)->toBeFile();

    return (string) file_get_contents($candidate);
}
