<?php

declare(strict_types=1);

it('locks issue44 user profile portal backend contracts', function (): void {
    $contracts = [
        'app/Services/Profile/ProfilePortalPresenter.php' => [
            'final class ProfilePortalPresenter',
            'OidcScope::PROFILE',
            'OidcScope::EMAIL',
            'OidcScope::ROLES',
            'OidcScope::PERMISSIONS',
        ],
        'app/Actions/Profile/ShowProfilePortalAction.php' => [
            'AccessTokenGuard',
            'no-store, no-cache, must-revalidate, private',
            'OidcErrorResponse::json',
        ],
        'app/Actions/Profile/UpdateProfilePortalAction.php' => [
            'assertProfileScope',
            'editableFields',
            'changed_fields',
            'PROFILE_SELF_UPDATE',
        ],
        'app/Http/Controllers/Resource/ProfileController.php' => [
            'function show',
            'function update',
            'ShowProfilePortalAction',
            'UpdateProfilePortalAction',
        ],
        'routes/web.php' => [
            "Route::get('/api/profile'",
            "Route::patch('/api/profile'",
            'throttle:oidc-resource',
        ],
        'tests/Feature/Profile/ProfilePortalBackendContractTest.php' => [
            'stable no-store profile portal contract',
            'updates only allowed self profile fields',
            'not->toContain(\'Bearer\')',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue44_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps issue44 profile portal tests wired into root ci', function (): void {
    $ci = issue44_file('../../.github/workflows/ci.yml');

    foreach ([
        'ProfilePortalBackendContractTest.php',
        'UserProfilePortalEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue44_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
