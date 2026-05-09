<?php

declare(strict_types=1);

it('locks issue81 token lifecycle audit contract implementation', function (): void {
    $contracts = [
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'tokenLifecycle',
        ],
        'app/Actions/Oidc/ExchangeToken.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::tokenLifecycle',
            'token_issued',
            'token_refreshed',
            'token_request_failed',
            'recordTokenLifecycle',
            'tokenAuditContext',
            'refresh_token_issued',
            'refresh_token_rotated',
        ],
        'app/Actions/Oidc/RevokeToken.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::tokenLifecycle',
            'token_revoked',
            'recordRevocationAudit',
            'token_hash',
            'refresh_token_revoked',
            'access_token_revoked',
        ],
        'tests/Feature/Oidc/TokenLifecycleAuditContractTest.php' => [
            'records token issuance refresh replay and revocation lifecycle audit events without token leakage',
            'token_issued',
            'token_refreshed',
            'token_request_failed',
            'token_revoked',
            'not->toContain($initial[\'refresh_token\'])',
            'not->toContain((string) $rotated[\'refresh_token\'])',
            'not->toContain($initial[\'access_token\'])',
            'not->toContain($initial[\'id_token\'])',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue81_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue81 token lifecycle audit tests wired into root ci', function (): void {
    $ci = issue81_file('../../.github/workflows/ci.yml');

    foreach ([
        'TokenLifecycleAuditContractTest.php',
        'TokenLifecycleAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue81_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
