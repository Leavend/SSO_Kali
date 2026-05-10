<?php

declare(strict_types=1);

it('locks issue82 token revocation audit contract implementation', function (): void {
    $contracts = [
        'app/Actions/Oidc/RevokeToken.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::tokenLifecycle',
            "eventType: 'token_revoked'",
            'recordRevocationAudit',
            'tokenClass',
            'token_hash',
            'token_class',
            'refresh_token_family_hash',
            'access_token_jti_hash',
            'idempotent_unknown_token',
            'hash(\'sha256\'',
        ],
        'tests/Feature/Oidc/TokenRevocationAuditContractTest.php' => [
            'records refresh-token revocation audit with family correlation hash and no raw token leakage',
            'records access-token revocation audit with jti correlation hash and no raw token leakage',
            'records rfc7009 idempotent unknown-token and invalid-client revocation audits safely',
            'not->toContain($tokens[\'refresh_token\'])',
            'not->toContain($tokens[\'access_token\'])',
            'not->toContain($tokens[\'id_token\'])',
            'not->toContain(\'wrong-secret\')',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue82_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue82 token revocation audit tests wired into root ci', function (): void {
    $ci = issue82_file('../../.github/workflows/ci.yml');

    foreach ([
        'TokenRevocationAuditContractTest.php',
        'TokenRevocationAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue82_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
