<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use Illuminate\Support\Carbon;

/**
 * FR-009 / ISSUE-05: Proactive client secret expiry check command.
 *
 * Contract:
 *   - Reports clients with secrets expiring within threshold (default 14 days)
 *   - Reports clients with already-expired secrets
 *   - Returns success (0) when no expiring secrets found
 *   - Returns warning (1) when expiring/expired secrets found
 *   - Supports --days option to customize threshold
 */
beforeEach(function (): void {
    // Clean slate
    OidcClientRegistration::query()->delete();
});

it('exits with success when no secrets are expiring', function (): void {
    OidcClientRegistration::query()->create([
        'client_id' => 'healthy-client',
        'display_name' => 'Healthy Client',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://healthy.test',
        'redirect_uris' => ['https://healthy.test/callback'],
        'post_logout_redirect_uris' => ['https://healthy.test/'],
        'owner_email' => 'owner@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'secret_hash' => 'argon2id-hash-placeholder',
        'secret_expires_at' => Carbon::now()->addDays(60),
        'secret_rotated_at' => Carbon::now()->subDays(30),
    ]);

    $this->artisan('sso:check-secret-expiry')
        ->assertExitCode(0);
});

it('exits with warning when secrets are expiring within threshold', function (): void {
    OidcClientRegistration::query()->create([
        'client_id' => 'expiring-soon-client',
        'display_name' => 'Expiring Soon',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://expiring.test',
        'redirect_uris' => ['https://expiring.test/callback'],
        'post_logout_redirect_uris' => ['https://expiring.test/'],
        'owner_email' => 'owner@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'secret_hash' => 'argon2id-hash-placeholder',
        'secret_expires_at' => Carbon::now()->addDays(7),
        'secret_rotated_at' => Carbon::now()->subDays(83),
    ]);

    $this->artisan('sso:check-secret-expiry')
        ->expectsOutputToContain('Action required')
        ->assertExitCode(1);
});

it('reports already-expired secrets', function (): void {
    OidcClientRegistration::query()->create([
        'client_id' => 'expired-client',
        'display_name' => 'Expired Client',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://expired.test',
        'redirect_uris' => ['https://expired.test/callback'],
        'post_logout_redirect_uris' => ['https://expired.test/'],
        'owner_email' => 'owner@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'secret_hash' => 'argon2id-hash-placeholder',
        'secret_expires_at' => Carbon::now()->subDays(5),
        'secret_rotated_at' => Carbon::now()->subDays(95),
    ]);

    $this->artisan('sso:check-secret-expiry')
        ->expectsOutputToContain('Action required')
        ->assertExitCode(1);
});

it('supports custom --days threshold', function (): void {
    OidcClientRegistration::query()->create([
        'client_id' => 'custom-threshold-client',
        'display_name' => 'Custom Threshold',
        'type' => 'confidential',
        'environment' => 'production',
        'app_base_url' => 'https://custom.test',
        'redirect_uris' => ['https://custom.test/callback'],
        'post_logout_redirect_uris' => ['https://custom.test/'],
        'owner_email' => 'owner@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
        'secret_hash' => 'argon2id-hash-placeholder',
        'secret_expires_at' => Carbon::now()->addDays(25),
        'secret_rotated_at' => Carbon::now()->subDays(65),
    ]);

    // Default 14 days — should pass
    $this->artisan('sso:check-secret-expiry')
        ->assertExitCode(0);

    // Custom 30 days — should warn
    $this->artisan('sso:check-secret-expiry --days=30')
        ->expectsOutputToContain('Action required')
        ->assertExitCode(1);
});

it('ignores public clients without secrets', function (): void {
    OidcClientRegistration::query()->create([
        'client_id' => 'public-no-secret',
        'display_name' => 'Public SPA',
        'type' => 'public',
        'environment' => 'production',
        'app_base_url' => 'https://spa.test',
        'redirect_uris' => ['https://spa.test/callback'],
        'post_logout_redirect_uris' => ['https://spa.test/'],
        'owner_email' => 'owner@test.example',
        'provisioning' => 'manual',
        'contract' => [],
        'status' => 'active',
    ]);

    $this->artisan('sso:check-secret-expiry')
        ->assertExitCode(0);
});
