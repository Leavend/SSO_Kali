<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Admin\AdminPermissionMatrix;
use App\Support\Rbac\AdminMenu;
use App\Support\Rbac\AdminPermission;

it('returns all capabilities and visible menus for admin users', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);
    $matrix = app(AdminPermissionMatrix::class);
    $permissions = $matrix->for($admin);

    expect($permissions['capabilities'])->toHaveCount(count(AdminPermission::all()))
        ->and($permissions['capabilities'][AdminPermission::PANEL_VIEW])->toBeTrue()
        ->and($permissions['capabilities'][AdminPermission::USERS_WRITE])->toBeTrue()
        ->and($permissions['capabilities'][AdminPermission::EXTERNAL_IDPS_READ])->toBeTrue()
        ->and($permissions['capabilities'][AdminPermission::EXTERNAL_IDPS_WRITE])->toBeTrue()
        ->and($permissions['capabilities'][AdminPermission::AUTHENTICATION_AUDIT_READ])->toBeTrue()
        ->and($permissions['menus'])->toHaveCount(count(AdminMenu::ids()))
        ->and(visibleMenuIds($permissions['menus']))->toContain('dashboard', 'users', 'roles', 'clients', 'sessions', 'audit', 'authentication-audit', 'profile', 'ip-access');
});

it('limits normal users to profile capabilities and profile menu', function (): void {
    $user = User::factory()->create(['role' => 'user']);
    $matrix = app(AdminPermissionMatrix::class);
    $permissions = $matrix->for($user);

    expect($permissions['capabilities'][AdminPermission::PROFILE_READ])->toBeTrue()
        ->and($permissions['capabilities'][AdminPermission::PANEL_VIEW])->toBeFalse()
        ->and($permissions['capabilities'][AdminPermission::USERS_READ])->toBeFalse()
        ->and(visibleMenuIds($permissions['menus']))->toBe(['profile']);
});

it('denies unknown roles and unknown menu ids by default', function (): void {
    $user = User::factory()->create(['role' => 'operator']);
    $matrix = app(AdminPermissionMatrix::class);
    $permissions = $matrix->for($user);

    expect(array_filter($permissions['capabilities']))->toBe([])
        ->and(visibleMenuIds($permissions['menus']))->toBe([])
        ->and($matrix->canViewMenu($user, 'unknown-menu'))->toBeFalse();
});

it('uses centralized menu definitions for required permissions', function (): void {
    $menus = AdminMenu::definitions();
    $menuIds = AdminMenu::ids();

    // Index-brittle assertions replaced with by-ID lookups
    expect($menuIds)->toContain('dashboard')
        ->and($menuIds)->toContain('users')
        ->and($menuIds)->toContain('roles')
        ->and($menuIds)->toContain('clients')
        ->and($menuIds)->toContain('sessions')
        ->and($menuIds)->toContain('audit')
        ->and($menuIds)->toContain('authentication-audit')
        ->and($menuIds)->toContain('profile')
        ->and($menuIds)->toContain('ip-access');

    $byId = collect($menus)->keyBy('id');
    expect($byId['users']['required_permission'])->toBe(AdminPermission::USERS_READ)
        ->and($byId['sessions']['required_permission'])->toBe(AdminPermission::SESSIONS_READ)
        ->and($byId['audit']['required_permission'])->toBe(AdminPermission::OBSERVABILITY_READ)
        ->and($byId['authentication-audit']['required_permission'])->toBe(AdminPermission::AUTHENTICATION_AUDIT_READ);
});

/**
 * @param  list<array{id: string, visible: bool}>  $menus
 * @return list<string>
 */
function visibleMenuIds(array $menus): array
{
    return collect($menus)
        ->filter(fn (array $menu): bool => $menu['visible'])
        ->pluck('id')
        ->values()
        ->all();
}
