<?php

declare(strict_types=1);

use App\Actions\Admin\CreateManagedRoleAction;
use App\Actions\Admin\DeleteManagedRoleAction;
use App\Actions\Admin\SyncRolePermissionsAction;
use App\Actions\Admin\SyncUserRolesAction;
use App\Actions\Admin\UpdateManagedRoleAction;
use App\Http\Requests\Admin\SyncUserRolesRequest;
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

it('syncs a single normalized role to users by slug and mirrors users.role', function (): void {
    $actor = User::factory()->create(['role' => 'admin', 'email' => 'actor@example.test']);
    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();
    $actor->roles()->sync([$adminRole->id]);

    $user = User::factory()->create(['role' => 'user', 'email' => 'target@example.test']);
    $role = Role::query()->where('slug', 'auditor')->firstOrFail();

    $updated = app(SyncUserRolesAction::class)->execute($actor, $user, [$role->slug]);

    expect($updated->roles->pluck('slug')->all())->toBe(['auditor'])
        ->and($updated->role)->toBe('auditor');
});

it('rejects multi-role payloads in the sync request', function (): void {
    $request = new SyncUserRolesRequest;
    $validator = validator(
        ['role_slugs' => ['admin', 'auditor']],
        $request->rules(),
        $request->messages(),
    );

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->first('role_slugs'))->toBe('Satu akun hanya boleh memiliki satu peran.');
});

it('blocks demoting a protected admin email', function (): void {
    config()->set('sso.admin_emails', ['protected@example.test']);

    $actor = User::factory()->create(['role' => 'admin', 'email' => 'actor@example.test']);
    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();
    $userRole = Role::query()->where('slug', 'user')->firstOrFail();
    $actor->roles()->sync([$adminRole->id]);

    $protected = User::factory()->create(['role' => 'admin', 'email' => 'protected@example.test']);
    $protected->roles()->sync([$adminRole->id]);

    expect(fn () => app(SyncUserRolesAction::class)->execute($actor, $protected, [$userRole->slug]))
        ->toThrow(RuntimeException::class, 'Akun terproteksi (whitelist) — role tidak dapat diubah.');
});

it('blocks self-demotion of the last admin', function (): void {
    $actor = User::factory()->create(['role' => 'admin', 'email' => 'actor@example.test']);
    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();
    $userRole = Role::query()->where('slug', 'user')->firstOrFail();
    $actor->roles()->sync([$adminRole->id]);

    expect(fn () => app(SyncUserRolesAction::class)->execute($actor, $actor, [$userRole->slug]))
        ->toThrow(RuntimeException::class, 'Admin terakhir tidak dapat menurunkan perannya sendiri.');
});
