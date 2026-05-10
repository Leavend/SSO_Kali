<?php

declare(strict_types=1);

it('locks issue86 authentication audit admin permission matrix implementation', function (): void {
    $contracts = [
        'app/Support/Rbac/AdminPermission.php' => [
            'AUTHENTICATION_AUDIT_READ',
            'admin.authentication-audit.read',
            'self::AUTHENTICATION_AUDIT_READ',
        ],
        'app/Support/Rbac/AdminMenu.php' => [
            'AUTHENTICATION_AUDIT',
            'authentication-audit',
            'Authentication Audit',
            'AdminPermission::AUTHENTICATION_AUDIT_READ',
        ],
        'app/Services/Admin/AdminPermissionMatrix.php' => [
            'canReadAuthenticationAudit',
            'AdminPermission::AUTHENTICATION_AUDIT_READ',
        ],
        'routes/admin.php' => [
            '/audit/authentication-events',
            'AdminPermission::AUTHENTICATION_AUDIT_READ',
        ],
        'tests/Feature/Admin/AdminAuthenticationAuditApiContractTest.php' => [
            'requires dedicated admin authentication audit read permission for authentication audit access',
            'AdminPermission::AUTHENTICATION_AUDIT_READ',
        ],
        'tests/Feature/Admin/AuthenticationAuditPermissionMatrixContractTest.php' => [
            'separates authentication audit read access from admin operational audit read access',
            'publishes authentication audit capability and menu metadata in the permission matrix payload',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue86_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue86 authentication audit permission matrix tests wired into root ci', function (): void {
    $ci = issue86_file('../../.github/workflows/ci.yml');

    foreach ([
        'AuthenticationAuditPermissionMatrixContractTest.php',
        'AuthenticationAuditPermissionMatrixEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue86_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
