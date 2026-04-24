<?php

declare(strict_types=1);

use App\Models\LogoutTokenReplay;
use Tests\TestCase;

it('prunes expired logout replay markers through the scheduled command', function (): void {
    /** @var TestCase $this */
    LogoutTokenReplay::query()->create([
        'jti' => 'expired-jti',
        'expires_at' => now()->subMinute(),
    ]);

    LogoutTokenReplay::query()->create([
        'jti' => 'active-jti',
        'expires_at' => now()->addMinute(),
    ]);

    $this->artisan('sso:prune-logout-token-replays')
        ->expectsOutputToContain('Pruned 1 expired logout replay markers.')
        ->assertSuccessful();

    expect(LogoutTokenReplay::query()->pluck('jti')->all())->toBe(['active-jti']);
});

it('supports dry-run pruning for expired logout replay markers', function (): void {
    /** @var TestCase $this */
    LogoutTokenReplay::query()->create([
        'jti' => 'expired-jti',
        'expires_at' => now()->subMinute(),
    ]);

    $this->artisan('sso:prune-logout-token-replays --dry-run')
        ->expectsOutputToContain('Found 1 expired logout replay markers.')
        ->assertSuccessful();

    expect(LogoutTokenReplay::query()->pluck('jti')->all())->toBe(['expired-jti']);
});
