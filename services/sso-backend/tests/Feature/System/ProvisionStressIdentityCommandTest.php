<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

it('provisions a dedicated production stress user without exposing plaintext secrets', function (): void {
    Artisan::call('sso:provision-stress-identity', [
        '--email' => 'stress-sso@example.test',
        '--subject-id' => 'usr_stress_sso_prod',
        '--password' => 'Stress-Password-For-Test-Only-123!',
    ]);

    $output = Artisan::output();
    $user = User::query()->where('subject_id', 'usr_stress_sso_prod')->firstOrFail();

    expect($user->email)->toBe('stress-sso@example.test')
        ->and($user->display_name)->toBe('SSO Production Stress Test User')
        ->and($user->status)->toBe('active')
        ->and($user->role)->toBe('stress_test')
        ->and($user->local_account_enabled)->toBeTrue()
        ->and(Hash::check('Stress-Password-For-Test-Only-123!', (string) $user->password))->toBeTrue()
        ->and($output)->toContain('Stress identity provisioned')
        ->and($output)->toContain('usr_stress_sso_prod')
        ->and($output)->not->toContain('Stress-Password-For-Test-Only-123!');
});

it('keeps stress identity provisioning idempotent', function (): void {
    $payload = [
        '--email' => 'stress-sso@example.test',
        '--subject-id' => 'usr_stress_sso_prod',
        '--password' => 'Stress-Password-For-Test-Only-123!',
    ];

    Artisan::call('sso:provision-stress-identity', $payload);
    Artisan::call('sso:provision-stress-identity', $payload);

    expect(User::query()->where('subject_id', 'usr_stress_sso_prod')->count())->toBe(1);
});
