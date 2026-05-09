<?php

declare(strict_types=1);

it('locks fr003 admin menu authorization into the backend contract', function (): void {
    $contracts = [
        'app/Support/Rbac/AdminMenu.php' => [
            'final class AdminMenu',
            "public const DASHBOARD = 'dashboard'",
            'AdminPermission::USERS_READ',
            'AdminPermission::PROFILE_READ',
        ],
        'app/Services/Admin/AdminPermissionMatrix.php' => [
            'capabilitiesFor',
            'menusFor',
            'canViewMenu',
            'AdminMenu::definitions()',
        ],
        'tests/Feature/Admin/AdminPermissionMatrixMenuContractTest.php' => [
            'returns all capabilities and visible menus',
            'limits normal users to profile capabilities',
            'denies unknown roles and unknown menu ids by default',
        ],
        'tests/Feature/Admin/AdminPrincipalBootstrapGateTest.php' => [
            "['permissions']['capabilities']['admin.panel.view']",
            'principal.permissions.menus.0.id',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = fr003_admin_menu_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps fr003 admin menu authorization tests wired into root ci', function (): void {
    $ci = fr003_admin_menu_file('../../.github/workflows/ci.yml');

    foreach ([
        'AdminPermissionMatrixMenuContractTest.php',
        'Fr003AdminMenuAuthorizationHarnessTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function fr003_admin_menu_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
