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
