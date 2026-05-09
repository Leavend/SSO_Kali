<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminPermissionMatrix;
use App\Support\Rbac\AdminMenu;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

it('exposes external idp capabilities only through explicit read and write permissions', function (): void {
    $this->seed(RbacSeeder::class);

    $readOnly = externalIdpMatrixUser('external-idp-reader', [AdminPermission::EXTERNAL_IDPS_READ]);
    $writer = externalIdpMatrixUser('external-idp-writer', [
        AdminPermission::EXTERNAL_IDPS_READ,
        AdminPermission::EXTERNAL_IDPS_WRITE,
    ]);
    $clientOnly = externalIdpMatrixUser('client-only', [AdminPermission::CLIENTS_WRITE]);
    $matrix = app(AdminPermissionMatrix::class);

    expect($matrix->canReadExternalIdps($readOnly))->toBeTrue()
        ->and($matrix->canManageExternalIdps($readOnly))->toBeFalse()
        ->and($matrix->canReadExternalIdps($writer))->toBeTrue()
        ->and($matrix->canManageExternalIdps($writer))->toBeTrue()
        ->and($matrix->canReadExternalIdps($clientOnly))->toBeFalse()
        ->and($matrix->canManageExternalIdps($clientOnly))->toBeFalse();
});

it('adds a dedicated external idps menu guarded by the read permission', function (): void {
    $this->seed(RbacSeeder::class);

    $reader = externalIdpMatrixUser('external-idp-reader', [AdminPermission::EXTERNAL_IDPS_READ]);
    $user = User::factory()->create(['role' => 'user']);
    $matrix = app(AdminPermissionMatrix::class);

    expect(AdminMenu::ids())->toContain(AdminMenu::EXTERNAL_IDPS)
        ->and(collect(AdminMenu::definitions())->contains(fn (array $menu): bool => $menu['id'] === AdminMenu::EXTERNAL_IDPS
            && $menu['required_permission'] === AdminPermission::EXTERNAL_IDPS_READ))->toBeTrue()
        ->and($matrix->canViewMenu($reader, AdminMenu::EXTERNAL_IDPS))->toBeTrue()
        ->and($matrix->canViewMenu($user, AdminMenu::EXTERNAL_IDPS))->toBeFalse();
});

it('locks external idp admin routes to read write step-up and mfa policy', function (): void {
    $routes = file_get_contents(base_path('routes/admin.php'));

    expect($routes)->toContain('AdminPermission::EXTERNAL_IDPS_READ')
        ->and($routes)->toContain('AdminPermission::EXTERNAL_IDPS_WRITE')
        ->and($routes)->toContain("EnsureFreshAdminAuth::class.':read'")
        ->and($routes)->toContain("EnsureFreshAdminAuth::class.':step_up'")
        ->and($routes)->toContain('EnsureAdminMfaAssurance::class')
        ->and($routes)->toContain("Route::get('/external-idps'")
        ->and($routes)->toContain("Route::post('/external-idps'")
        ->and($routes)->toContain("Route::patch('/external-idps/{providerKey}'")
        ->and($routes)->toContain("Route::delete('/external-idps/{providerKey}'");
});

/**
 * @param  list<string>  $permissions
 */
function externalIdpMatrixUser(string $roleSlug, array $permissions): User
{
    $role = Role::query()->updateOrCreate(
        ['slug' => $roleSlug],
        ['name' => str($roleSlug)->replace('-', ' ')->title()->toString(), 'is_system' => true],
    );

    $permissionIds = Permission::query()
        ->whereIn('slug', $permissions)
        ->pluck('id')
        ->all();
    $role->permissions()->sync($permissionIds);

    $user = User::factory()->create(['role' => 'user']);
    $user->roles()->sync([$role->id]);

    return $user;
}
