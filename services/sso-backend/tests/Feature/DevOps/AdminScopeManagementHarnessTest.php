<?php

declare(strict_types=1);

it('locks issue43 scope management and token claim enforcement contracts', function (): void {
    $contracts = [
        'app/Support/Oidc/OidcScope.php' => [
            "public const ROLES = 'roles'",
            "public const PERMISSIONS = 'permissions'",
            'default_allowed',
        ],
        'app/Services/Oidc/ScopePolicy.php' => [
            'validateAuthorizationRequest',
            'assertOpenid',
            'assertAllowed',
        ],
        'app/Actions/Oidc/CreateAuthorizationRedirect.php' => [
            'ScopePolicy',
            'validateAuthorizationRequest',
            'invalid_scope',
        ],
        'app/Services/Oidc/UserClaimsFactory.php' => [
            'roleClaims',
            'permissionClaims',
            'OidcScope::ROLES',
            'OidcScope::PERMISSIONS',
        ],
        'app/Http/Controllers/Admin/ClientController.php' => [
            'function scopes',
            'function syncScopes',
            'allowed_scopes',
        ],
        'routes/admin.php' => [
            "Route::get('/scopes'",
            "Route::put('/clients/{clientId}/scopes'",
            'AdminPermission::CLIENTS_WRITE',
        ],
        'tests/Unit/Oidc/ScopePolicyTest.php' => [
            'rejects unknown requested scopes',
            'rejects scopes not allowed for the client',
        ],
        'tests/Feature/Oidc/UserClaimsFactoryScopeEnforcementTest.php' => [
            'does not emit profile email roles or permissions',
            'emits roles and permissions only when RBAC scopes are granted',
        ],
        'tests/Feature/Admin/ClientScopeManagementBackendTest.php' => [
            'exposes the backend-owned scope catalog',
            'without leaking secrets',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue43_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps issue43 tests wired into root ci', function (): void {
    $ci = issue43_file('../../.github/workflows/ci.yml');

    foreach ([
        'ScopePolicyTest.php',
        'UserClaimsFactoryScopeEnforcementTest.php',
        'ClientScopeManagementBackendTest.php',
        'AdminScopeManagementHarnessTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue43_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
