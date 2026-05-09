<?php

declare(strict_types=1);

it('locks adminBackend rbac domain and policy contract into the backend', function (): void {
    $contracts = [
        'database/migrations/2026_05_09_000001_create_rbac_tables.php' => [
            "Schema::create('roles'",
            "Schema::create('permissions'",
            "Schema::create('role_user'",
            "Schema::create('permission_role'",
        ],
        'app/Models/Role.php' => ['final class Role', 'permissions()', 'users()'],
        'app/Models/Permission.php' => ['final class Permission', 'roles()'],
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
        'app/Http/Middleware/RequireAdminPermission.php' => [
            'permission_required',
            'missing_admin_context',
            'AdminAuditTaxonomy::FORBIDDEN',
        ],
        'tests/Feature/Admin/RbacPolicyContractTest.php' => [
            'denies unknown roles by default',
            'resolves normalized role assignments before legacy fallback',
        ],
        'tests/Feature/Admin/AdminPermissionMiddlewareTest.php' => [
            'rejects admins without required permission',
            'must-not-be-copied',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = adminBackend_rbac_file_contents($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps adminBackend rbac tests wired into root ci', function (): void {
    $ci = adminBackend_rbac_file_contents('../../.github/workflows/ci.yml');

    foreach ([
        'RbacPolicyContractTest.php',
        'AdminPermissionMiddlewareTest.php',
        'AdminRbacDomainEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function adminBackend_rbac_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
