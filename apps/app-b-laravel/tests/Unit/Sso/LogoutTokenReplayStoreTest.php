<?php

declare(strict_types=1);

use App\Models\LogoutTokenReplay;
use App\Services\Sso\LogoutTokenReplayStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Cache::flush();
});

it('stores logout token jti once and rejects replay', function (): void {
    $store = app(LogoutTokenReplayStore::class);
    $expiresAt = time() + 120;

    $store->remember('logout-jti-1', $expiresAt);

    expect(fn () => $store->remember('logout-jti-1', $expiresAt))
        ->toThrow(RuntimeException::class, 'replay');

    expect($store->replayAlerts())->toBe(1)
        ->and(LogoutTokenReplay::query()->count())->toBe(1);
});

it('allows a jti to be reused after the previous marker expires', function (): void {
    $store = app(LogoutTokenReplayStore::class);

    LogoutTokenReplay::query()->create([
        'jti' => 'logout-jti-1',
        'expires_at' => now()->subMinute(),
    ]);

    $store->remember('logout-jti-1', time() + 120);

    expect(LogoutTokenReplay::query()->count())->toBe(1)
        ->and(LogoutTokenReplay::query()->value('jti'))->toBe('logout-jti-1');
});

it('prunes expired markers without touching active ones', function (): void {
    $store = app(LogoutTokenReplayStore::class);

    LogoutTokenReplay::query()->create([
        'jti' => 'expired-jti',
        'expires_at' => now()->subMinute(),
    ]);

    LogoutTokenReplay::query()->create([
        'jti' => 'active-jti',
        'expires_at' => now()->addMinute(),
    ]);

    expect($store->expiredCount())->toBe(1)
        ->and($store->pruneExpired())->toBe(1)
        ->and(LogoutTokenReplay::query()->pluck('jti')->all())->toBe(['active-jti']);
});
