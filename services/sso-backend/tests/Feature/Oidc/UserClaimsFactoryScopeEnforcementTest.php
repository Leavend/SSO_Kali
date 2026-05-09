<?php

declare(strict_types=1);

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Oidc\UserClaimsFactory;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;

beforeEach(function (): void {
    $this->seed(RbacSeeder::class);
});

it('does not emit profile email roles or permissions without matching scopes', function (): void {
    $claims = app(UserClaimsFactory::class)->accessTokenClaims(
        scopedClaimsUser(),
        scopedClaimsContext('openid'),
        'jti-no-extra-claims',
    );

    expect($claims)->toHaveKey('sub')
        ->and($claims)->not->toHaveKeys(['name', 'email', 'roles', 'permissions']);
});

it('emits profile and email claims only when those scopes are granted', function (): void {
    $claims = app(UserClaimsFactory::class)->accessTokenClaims(
        scopedClaimsUser(),
        scopedClaimsContext('openid profile email'),
        'jti-profile-email',
    );

    expect($claims['name'])->toBe('Scope Test User')
        ->and($claims['email'])->toBe('scope-user@example.test')
        ->and($claims)->not->toHaveKeys(['roles', 'permissions']);
});

it('emits roles and permissions only when RBAC scopes are granted', function (): void {
    $user = scopedClaimsUser();
    $role = Role::query()->where('slug', 'admin')->firstOrFail();
    $permission = Permission::query()->where('slug', AdminPermission::USERS_READ)->firstOrFail();
    $role->permissions()->syncWithoutDetaching([$permission->id]);
    $user->roles()->sync([$role->id]);

    $claims = app(UserClaimsFactory::class)->accessTokenClaims(
        $user,
        scopedClaimsContext('openid roles permissions'),
        'jti-rbac-claims',
    );

    expect($claims['roles'])->toContain('admin')
        ->and($claims['permissions'])->toContain(AdminPermission::USERS_READ)
        ->and($claims)->not->toHaveKeys(['name', 'email']);
});

function scopedClaimsUser(): User
{
    return User::factory()->create([
        'subject_id' => 'scope-claim-subject',
        'display_name' => 'Scope Test User',
        'given_name' => 'Scope',
        'family_name' => 'User',
        'email' => 'scope-user@example.test',
        'email_verified_at' => now(),
    ]);
}

function scopedClaimsContext(string $scope): array
{
    return [
        'client_id' => 'scope-test-client',
        'scope' => $scope,
        'session_id' => 'scope-session-id',
    ];
}
