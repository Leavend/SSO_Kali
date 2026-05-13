<?php

declare(strict_types=1);

/**
 * PasswordHashCompatibility Contract Test.
 *
 * Memastikan login tetap berfungsi ketika database berisi password hash
 * dari algoritma lama (bcrypt) sementara sistem dikonfigurasi argon2id.
 *
 * Reproduces: 500 Internal Server Error pada POST /api/auth/login
 * Root cause: Laravel 13 'hashed' cast throws RuntimeException ketika
 *             Hash::verifyConfiguration() menemukan hash dari algoritma berbeda.
 *
 * Fix: DatabaseDirectoryUserProvider::validatePassword() menggunakan
 *      getRawOriginal() untuk bypass cast + transparent rehash.
 */

use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('authenticates user with legacy bcrypt password hash without 500 error', function (): void {
    // Simulate a user whose password was hashed with bcrypt before migration to argon2id.
    // Insert directly to bypass the 'hashed' cast which would auto-hash with argon2id.
    $user = User::factory()->create();
    $bcryptHash = password_hash('legacy-password', PASSWORD_BCRYPT);

    // Force-update the raw password column to a bcrypt hash
    User::withoutEvents(function () use ($user, $bcryptHash): void {
        User::query()
            ->whereKey($user->getKey())
            ->update(['password' => $bcryptHash]);
    });

    // Verify the stored hash is indeed bcrypt (starts with $2y$)
    $rawHash = User::query()->whereKey($user->getKey())->value('password');
    expect($rawHash)->toStartWith('$2y$');

    // Act: attempt login — this previously threw RuntimeException (500)
    $response = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'legacy-password',
    ]);

    // Assert: login succeeds, no 500
    $response->assertOk();
    $response->assertJsonPath('authenticated', true);
});

it('rejects invalid password for user with legacy bcrypt hash without 500 error', function (): void {
    $user = User::factory()->create();
    $bcryptHash = password_hash('legacy-password', PASSWORD_BCRYPT);

    User::withoutEvents(function () use ($user, $bcryptHash): void {
        User::query()
            ->whereKey($user->getKey())
            ->update(['password' => $bcryptHash]);
    });

    // Act: attempt login with wrong password
    $response = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'wrong-password',
    ]);

    // Assert: returns 401, not 500
    $response->assertUnauthorized();
    $response->assertJsonPath('authenticated', false);
});

it('transparently rehashes legacy bcrypt password to argon2id on successful login', function (): void {
    $user = User::factory()->create();
    $bcryptHash = password_hash('rehash-me', PASSWORD_BCRYPT);

    User::withoutEvents(function () use ($user, $bcryptHash): void {
        User::query()
            ->whereKey($user->getKey())
            ->update(['password' => $bcryptHash]);
    });

    // Confirm it's bcrypt before login
    $hashBefore = User::query()->whereKey($user->getKey())->value('password');
    expect($hashBefore)->toStartWith('$2y$');

    // Act: successful login triggers rehash
    $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'rehash-me',
    ])->assertOk();

    // Assert: password is now argon2id
    $hashAfter = User::query()->whereKey($user->getKey())->value('password');
    expect($hashAfter)->toStartWith('$argon2id$');

    // Verify the new hash still validates
    expect(Hash::check('rehash-me', $hashAfter))->toBeTrue();
});

it('does not rehash when password already uses the current algorithm', function (): void {
    $user = User::factory()->create([
        'password' => 'already-argon2id',
    ]);

    // Confirm it's argon2id
    $hashBefore = User::query()->whereKey($user->getKey())->value('password');
    expect($hashBefore)->toStartWith('$argon2id$');

    // Act: login
    $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'already-argon2id',
    ])->assertOk();

    // Assert: hash unchanged (no unnecessary write)
    $hashAfter = User::query()->whereKey($user->getKey())->value('password');
    expect($hashAfter)->toBe($hashBefore);
});
