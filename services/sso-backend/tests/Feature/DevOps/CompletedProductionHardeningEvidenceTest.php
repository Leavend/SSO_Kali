<?php

declare(strict_types=1);

it('locks completed production hardening aggregate evidence files into ci', function (): void {
    $contracts = [
        'tests/Feature/DevOps/ProductionRuntimeHardeningEvidenceTest.php' => [
            'runtime verification',
            'production_public_domain_smoke',
            'production_connection_tuning',
        ],
        'tests/Feature/DevOps/ProductionAdminHardeningEvidenceTest.php' => [
            'adminBackend rbac domain',
            'adminBackend user management',
            'issue45 admin audit trail',
        ],
        'tests/Feature/DevOps/ProductionOidcHardeningEvidenceTest.php' => [
            'oidcBackend oidc backend aggregate',
            'production_oauth_token_flow_smoke',
            'backchannel_logout',
        ],
        'tests/Feature/DevOps/ExternalIdpCoverageEvidenceTest.php' => [
            'complete externalIdp external idp aggregate evidence set',
            'UC-08',
            'UC-50',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = completed_hardening_file_contents($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps completed hardening harnesses wired into root CI', function (): void {
    $ci = completed_hardening_file_contents('../../.github/workflows/ci.yml');

    foreach ([
        'ProductionRuntimeHardeningEvidenceTest.php',
        'ProductionAdminHardeningEvidenceTest.php',
        'ProductionOidcHardeningEvidenceTest.php',
        'ExternalIdpCoverageEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function completed_hardening_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
