<?php

declare(strict_types=1);

use App\Models\Role;
use App\Models\User;
use App\Services\Security\BreachedPasswordVerifier;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RbacSeeder;

it('assigns the seeded admin user to the admin role pivot', function (): void {
    $this->seed(DatabaseSeeder::class);

    $admin = User::query()
        ->where('email', config('sso.seed.admin_email', 'admin@example.test'))
        ->firstOrFail();

    expect($admin->roles()->where('slug', 'admin')->exists())->toBeTrue();
});

it('assigns newly registered users to the default user role pivot', function (): void {
    $this->seed(RbacSeeder::class);
    $this->app->instance(BreachedPasswordVerifier::class, new class
    {
        public function isBreached(mixed $password): bool
        {
            return false;
        }
    });

    $this->postJson('/api/auth/register', [
        'name' => 'Registered User',
        'email' => 'registered-user@example.test',
        'password' => 'SecurePass123!',
        'password_confirmation' => 'SecurePass123!',
    ])->assertCreated();

    $user = User::query()->where('email', 'registered-user@example.test')->firstOrFail();
    $role = Role::query()->where('slug', 'user')->firstOrFail();

    $this->assertDatabaseHas('role_user', [
        'user_id' => $user->id,
        'role_id' => $role->id,
    ]);
});

it('composes registered profile names from the first and last display words', function (): void {
    $this->app->instance(BreachedPasswordVerifier::class, new class
    {
        public function isBreached(mixed $password): bool
        {
            return false;
        }
    });

    $this->postJson('/api/auth/register', [
        'name' => 'Tio Hady Pranoto',
        'email' => 'composed-register@example.test',
        'password' => 'SecurePass123!',
        'password_confirmation' => 'SecurePass123!',
    ])->assertCreated()
        ->assertJsonPath('user.display_name', 'Tio Pranoto');

    $user = User::query()->where('email', 'composed-register@example.test')->firstOrFail();

    expect($user->display_name)->toBe('Tio Pranoto')
        ->and($user->given_name)->toBe('Tio')
        ->and($user->family_name)->toBe('Pranoto');
});

it('backfills legacy user role columns into the role pivot', function (): void {
    $this->seed(RbacSeeder::class);

    $admin = User::factory()->create(['role' => 'admin']);
    $user = User::factory()->create(['role' => 'user']);
    $unknown = User::factory()->create(['role' => 'legacy-missing']);

    $migration = require database_path('migrations/2026_06_03_000001_backfill_role_user_from_legacy_user_roles.php');
    $migration->up();
    $migration->up();

    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();
    $userRole = Role::query()->where('slug', 'user')->firstOrFail();

    $this->assertDatabaseHas('role_user', [
        'user_id' => $admin->id,
        'role_id' => $adminRole->id,
    ]);
    $this->assertDatabaseHas('role_user', [
        'user_id' => $user->id,
        'role_id' => $userRole->id,
    ]);
    $this->assertDatabaseMissing('role_user', ['user_id' => $unknown->id]);
    expect($admin->roles()->where('slug', 'admin')->count())->toBe(1);
});

it('syncs the admin role pivot when assigning admin from the console', function (): void {
    $this->seed(RbacSeeder::class);

    $user = User::factory()->create([
        'email' => 'promote-me@example.test',
        'role' => 'user',
    ]);

    $this->artisan('admin:assign-role', ['email' => 'promote-me@example.test'])
        ->assertSuccessful();

    $adminRole = Role::query()->where('slug', 'admin')->firstOrFail();

    expect($user->refresh()->role)->toBe('admin');
    $this->assertDatabaseHas('role_user', [
        'user_id' => $user->id,
        'role_id' => $adminRole->id,
    ]);
});
