<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminPermissionMatrix;
use App\Support\Rbac\AdminMenu;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    $this->seed(RbacSeeder::class);
});

it('separates authentication audit read access from admin operational audit read access', function (): void {
    $legacyAudit = issue86AdminWithPermissions([AdminPermission::AUDIT_READ]);
    $authenticationAudit = issue86AdminWithPermissions([AdminPermission::AUTHENTICATION_AUDIT_READ]);
    $matrix = app(AdminPermissionMatrix::class);

    expect($matrix->canReadAuditTrail($legacyAudit))->toBeTrue()
        ->and($matrix->canReadAuthenticationAudit($legacyAudit))->toBeFalse()
        ->and($matrix->canViewMenu($legacyAudit, AdminMenu::AUDIT))->toBeTrue()
        ->and($matrix->canViewMenu($legacyAudit, AdminMenu::AUTHENTICATION_AUDIT))->toBeFalse()
        ->and($matrix->canReadAuditTrail($authenticationAudit))->toBeFalse()
        ->and($matrix->canReadAuthenticationAudit($authenticationAudit))->toBeTrue()
        ->and($matrix->canViewMenu($authenticationAudit, AdminMenu::AUDIT))->toBeFalse()
        ->and($matrix->canViewMenu($authenticationAudit, AdminMenu::AUTHENTICATION_AUDIT))->toBeTrue();
});

it('publishes authentication audit capability and menu metadata in the permission matrix payload', function (): void {
    $user = issue86AdminWithPermissions([AdminPermission::AUTHENTICATION_AUDIT_READ]);
    $matrix = app(AdminPermissionMatrix::class)->for($user);
    $authenticationAuditMenu = collect($matrix['menus'])
        ->firstWhere('id', AdminMenu::AUTHENTICATION_AUDIT);

    expect($matrix['capabilities'][AdminPermission::AUTHENTICATION_AUDIT_READ])->toBeTrue()
        ->and($authenticationAuditMenu)->toMatchArray([
            'id' => AdminMenu::AUTHENTICATION_AUDIT,
            'label' => 'Authentication Audit',
            'required_permission' => AdminPermission::AUTHENTICATION_AUDIT_READ,
            'visible' => true,
        ]);
});

function issue86AdminWithPermissions(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'issue86-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'user',
    ]);
    $role = Role::query()->create(['slug' => 'issue86-role-'.uniqid(), 'name' => 'Issue 86 Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}
