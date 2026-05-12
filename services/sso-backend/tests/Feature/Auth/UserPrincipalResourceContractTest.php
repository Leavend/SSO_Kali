<?php

declare(strict_types=1);

/**
 * UserPrincipalResource Contract Test — ISSUE-06.
 *
 * Memastikan shape DTO yang dikembalikan oleh login dan session endpoint
 * selalu konsisten dengan kontrak FE `SsoUser` di `types/auth.types.ts`:
 *
 *   { id: number, subject_id: string, email: string, display_name: string, roles: string[] }
 */

use App\Http\Resources\UserPrincipalResource;
use App\Models\User;
use App\Services\Directory\DirectoryUserProvider;

beforeEach(function (): void {
    $this->mock(DirectoryUserProvider::class, function ($mock): void {
        $mock->shouldReceive('rolesFor')
            ->andReturn(['user', 'editor']);
    });
});

it('produces exactly the SsoUser shape with no extra fields', function (): void {
    $user = User::factory()->create([
        'subject_id' => 'dto-test-subject',
        'email' => 'dto@example.test',
        'display_name' => 'DTO User',
        'status' => 'active',
    ]);

    $resource = (new UserPrincipalResource($user))->resolve();

    // Exact keys — no more, no less.
    expect(array_keys($resource))->toBe(['id', 'subject_id', 'email', 'display_name', 'roles']);

    // Types match FE contract.
    expect($resource['id'])->toBeInt()
        ->and($resource['subject_id'])->toBe('dto-test-subject')
        ->and($resource['email'])->toBe('dto@example.test')
        ->and($resource['display_name'])->toBe('DTO User')
        ->and($resource['roles'])->toBe(['user', 'editor']);
});

it('never leaks sensitive model attributes (password, remember_token, timestamps)', function (): void {
    $user = User::factory()->create([
        'subject_id' => 'dto-leak-test',
        'email' => 'leak@example.test',
        'display_name' => 'Leak Test',
        'password' => bcrypt('secret'),
    ]);

    $resource = (new UserPrincipalResource($user))->resolve();

    expect($resource)->not->toHaveKeys([
        'password',
        'remember_token',
        'email_verified_at',
        'created_at',
        'updated_at',
        'status',
        'subject_uuid',
    ]);
});

it('matches the InspectSsoSessionAction output shape for session endpoint consistency', function (): void {
    $user = User::factory()->create([
        'subject_id' => 'dto-session-test',
        'email' => 'session@example.test',
        'display_name' => 'Session User',
    ]);

    $resourceOutput = (new UserPrincipalResource($user))->resolve();

    // InspectSsoSessionAction builds: { id, subject_id, email, display_name, roles }
    // Both must have identical keys.
    $expectedKeys = ['id', 'subject_id', 'email', 'display_name', 'roles'];
    expect(array_keys($resourceOutput))->toBe($expectedKeys);
});
