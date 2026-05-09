<?php

declare(strict_types=1);

it('locks issue42 admin management crud contracts into production hardening', function (): void {
    $contracts = [
        'app/Http/Controllers/Admin/RoleController.php' => [
            'create_managed_role',
            'sync_role_permissions',
            'sync_user_roles',
        ],
        'app/Http/Controllers/Admin/ClientController.php' => [
            'function show',
            'function update',
            'function destroy',
            'has_secret_hash',
        ],
        'app/Actions/Admin/UpdateManagedClientAction.php' => [
            'update_managed_client',
            'array_diff($changedFields',
            'flush()',
        ],
        'routes/admin.php' => [
            'AdminPermission::ROLES_WRITE',
            'AdminPermission::CLIENTS_WRITE',
            "Route::put('/roles/{role}/permissions'",
            "Route::patch('/clients/{clientId}'",
        ],
        'tests/Feature/Admin/RolePermissionManagementBackendTest.php' => [
            'protects system roles',
            'syncs normalized roles to users by slug',
        ],
        'tests/Feature/Admin/ClientManagementCrudBackendTest.php' => [
            'without exposing or changing secret hashes',
            'secret safe',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue42_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps issue42 tests wired into root ci', function (): void {
    $ci = issue42_file('../../.github/workflows/ci.yml');

    foreach ([
        'RolePermissionManagementBackendTest.php',
        'ClientManagementCrudBackendTest.php',
        'Fr003AdminManagementCrudHarnessTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue42_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
