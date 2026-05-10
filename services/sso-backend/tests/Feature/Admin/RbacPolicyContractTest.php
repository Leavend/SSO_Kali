<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminPermissionMatrix;
use App\Services\Admin\AdminRbacResolver;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

it('grants baseline admin permissions through the legacy role fallback', function (): void {
    $admin = User::factory()->create(['role' => 'admin']);

    $permissions = app(AdminRbacResolver::class)->permissionsFor($admin);

    expect($permissions)->toContain(AdminPermission::PANEL_VIEW)
        ->and($permissions)->toContain(AdminPermission::SESSIONS_TERMINATE)
        ->and($permissions)->toContain(AdminPermission::CLIENTS_WRITE)
        ->and($permissions)->toContain(AdminPermission::EXTERNAL_IDPS_READ)
        ->and($permissions)->toContain(AdminPermission::EXTERNAL_IDPS_WRITE)
        ->and($permissions)->toContain(AdminPermission::AUTHENTICATION_AUDIT_READ);
});

it('keeps normal users least privileged through the legacy role fallback', function (): void {
    $user = User::factory()->create(['role' => 'user']);

    $matrix = app(AdminPermissionMatrix::class);

    expect($matrix->for($user)['permissions'])->toBe(AdminPermission::userDefaults())
        ->and($matrix->canViewAdminPanel($user))->toBeFalse()
        ->and($matrix->canManageUsers($user))->toBeFalse()
        ->and($matrix->canReadAuditTrail($user))->toBeFalse()
        ->and($matrix->canReadAuthenticationAudit($user))->toBeFalse()
        ->and($matrix->canReadExternalIdps($user))->toBeFalse()
        ->and($matrix->canManageExternalIdps($user))->toBeFalse();
});

it('denies unknown roles by default', function (): void {
    $user = User::factory()->create(['role' => 'operator']);

    expect(app(AdminRbacResolver::class)->permissionsFor($user))->toBe([]);
});

it('resolves normalized role assignments before legacy fallback', function (): void {
    $this->seed(RbacSeeder::class);

    $admin = User::factory()->create(['role' => 'user']);
    $role = Role::query()->where('slug', 'admin')->firstOrFail();

    $admin->roles()->sync([$role->id]);

    expect(app(AdminPermissionMatrix::class)->canManageClients($admin))->toBeTrue()
        ->and(app(AdminPermissionMatrix::class)->canTerminateSessions($admin))->toBeTrue();
});

it('seeds baseline roles and permission matrix idempotently', function (): void {
    $this->seed(RbacSeeder::class);
    $this->seed(RbacSeeder::class);

    expect(Role::query()->where('slug', 'admin')->count())->toBe(1)
        ->and(Role::query()->where('slug', 'user')->count())->toBe(1)
        ->and(Permission::query()->whereIn('slug', AdminPermission::all())->count())->toBe(count(AdminPermission::all()));
});
