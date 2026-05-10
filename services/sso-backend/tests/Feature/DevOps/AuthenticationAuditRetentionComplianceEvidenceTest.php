<?php

declare(strict_types=1);

it('locks issue87 authentication audit retention compliance implementation', function (): void {
    $contracts = [
        'config/sso.php' => [
            'authentication_retention_days',
            'SSO_AUTHENTICATION_AUDIT_RETENTION_DAYS',
        ],
        'app/Services/Audit/AuthenticationAuditRetentionPolicy.php' => [
            'AuthenticationAuditRetentionPolicy',
            'MINIMUM_RETENTION_DAYS = 90',
            'MAXIMUM_RETENTION_DAYS = 2555',
            'candidateCount',
            'prune',
            'report',
        ],
        'app/Console/Commands/PruneAuthenticationAuditEvents.php' => [
            'sso:prune-authentication-audit-events',
            '--dry-run',
            '--limit=1000',
            'Authentication audit prune candidate row(s)',
            'Pruned {$count} authentication audit event row(s).',
        ],
        'routes/console.php' => [
            "Schedule::command('sso:prune-authentication-audit-events')->daily()",
        ],
        'tests/Feature/Auth/AuthenticationAuditRetentionComplianceContractTest.php' => [
            'reports bounded authentication audit retention policy and candidate rows',
            'supports dry-run retention compliance without deleting authentication audit rows',
            'prunes only authentication audit rows older than the retention cutoff using a bounded batch',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue87_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue87 authentication audit retention tests wired into root ci', function (): void {
    $ci = issue87_file('../../.github/workflows/ci.yml');

    foreach ([
        'AuthenticationAuditRetentionComplianceContractTest.php',
        'AuthenticationAuditRetentionComplianceEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue87_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
