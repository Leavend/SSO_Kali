<?php

declare(strict_types=1);

use App\Actions\Admin\CreateManagedRoleAction;
use App\Actions\Admin\DeleteManagedRoleAction;
use App\Actions\Admin\SyncRolePermissionsAction;
use App\Actions\Admin\SyncUserRolesAction;
use App\Actions\Admin\UpdateManagedRoleAction;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    $this->seed(RbacSeeder::class);
});

it('creates updates syncs and deletes non-system roles', function (): void {
    $permission = Permission::query()->where('slug', AdminPermission::USERS_READ)->firstOrFail();

    $role = app(CreateManagedRoleAction::class)->execute([
        'slug' => 'support_agent',
        'name' => 'Support Agent',
        'description' => 'Can support users',
        'permission_slugs' => [$permission->slug],
    ]);

    expect($role->slug)->toBe('support_agent')
        ->and($role->is_system)->toBeFalse()
        ->and($role->permissions->pluck('slug')->all())->toContain(AdminPermission::USERS_READ);

    $role = app(UpdateManagedRoleAction::class)->execute($role, ['name' => 'Support Lead']);
    expect($role->name)->toBe('Support Lead');

    $role = app(SyncRolePermissionsAction::class)->execute($role, [AdminPermission::AUDIT_READ]);
    expect($role->permissions->pluck('slug')->all())->toBe([AdminPermission::AUDIT_READ]);

    app(DeleteManagedRoleAction::class)->execute($role);
    expect(Role::query()->where('slug', 'support_agent')->exists())->toBeFalse();
});

it('protects system roles from destructive metadata changes and deletion', function (): void {
    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();

    expect(fn () => app(UpdateManagedRoleAction::class)->execute($adminRole, ['name' => 'Root']))
        ->toThrow(RuntimeException::class, 'System role metadata cannot be modified.');

    expect(fn () => app(DeleteManagedRoleAction::class)->execute($adminRole))
        ->toThrow(RuntimeException::class, 'System roles cannot be deleted.');
});

it('syncs normalized roles to users by slug', function (): void {
    $user = User::factory()->create(['role' => 'user']);
    $role = Role::query()->create([
        'slug' => 'auditor',
        'name' => 'Auditor',
        'description' => null,
        'is_system' => false,
    ]);

    $updated = app(SyncUserRolesAction::class)->execute($user, [$role->slug]);

    expect($updated->roles->pluck('slug')->all())->toBe(['auditor']);
});
