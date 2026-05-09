<?php

declare(strict_types=1);

it('locks adminBackend user management backend lifecycle into production hardening', function (): void {
    $contracts = [
        'database/migrations/2026_05_09_000002_add_user_lifecycle_fields.php' => [
            'status',
            'disabled_at',
            'local_account_enabled',
            'password_reset_token_hash',
        ],
        'app/Http/Controllers/Admin/UserController.php' => [
            'create_managed_user',
            'deactivate_managed_user',
            'issue_managed_user_password_reset',
            'sync_managed_user_profile',
        ],
        'app/Actions/Admin/CreateManagedUserAction.php' => ['local_account_enabled', 'syncWithoutDetaching'],
        'app/Actions/Admin/DeactivateManagedUserAction.php' => ['Administrators cannot deactivate their own account'],
        'app/Actions/Admin/IssueManagedUserPasswordResetAction.php' => ['Hash::make($token)', 'reset_token'],
        'app/Actions/Admin/SyncManagedUserProfileAction.php' => ['profile_synced_at', 'array_intersect_key'],
        'routes/admin.php' => [
            'AdminPermission::USERS_WRITE',
            '/users/{subjectId}/deactivate',
            '/users/{subjectId}/password-reset',
        ],
        'tests/Feature/Admin/UserManagementBackendTest.php' => [
            'creates local fallback users',
            'stores only a password reset token hash',
            'syncs selected profile fields',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = adminBackend_user_management_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps adminBackend user management tests wired into root ci', function (): void {
    $ci = adminBackend_user_management_file('../../.github/workflows/ci.yml');

    foreach ([
        'UserManagementBackendTest.php',
        'AdminUserManagementHarnessTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function adminBackend_user_management_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
