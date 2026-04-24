<?php

declare(strict_types=1);

use App\Services\Oidc\AccessTokenRevocationStore;
use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    Cache::flush();
});

function revocationStore(): AccessTokenRevocationStore
{
    return new AccessTokenRevocationStore(app(ResilientCacheStore::class));
}

it('marks a JTI as revoked', function (): void {
    $store = revocationStore();

    expect($store->revoked('jti-001'))->toBeFalse();

    $store->revoke('jti-001', 900);

    expect($store->revoked('jti-001'))->toBeTrue();
});

it('returns false for a non-revoked JTI', function (): void {
    $store = revocationStore();

    expect($store->revoked('jti-never-revoked'))->toBeFalse();
});

it('tracks JTIs under a session', function (): void {
    $store = revocationStore();
    $expiresAt = time() + 900;

    $store->track('sid-001', 'jti-a', $expiresAt);
    $store->track('sid-001', 'jti-b', $expiresAt);

    expect($store->revoked('jti-a'))->toBeFalse();
    expect($store->revoked('jti-b'))->toBeFalse();
});

it('revokeSession() revokes all tracked JTIs for that session', function (): void {
    $store = revocationStore();
    $expiresAt = time() + 900;

    $store->track('sid-001', 'jti-a', $expiresAt);
    $store->track('sid-001', 'jti-b', $expiresAt);
    $store->track('sid-002', 'jti-c', $expiresAt);

    $store->revokeSession('sid-001');

    expect($store->revoked('jti-a'))->toBeTrue()
        ->and($store->revoked('jti-b'))->toBeTrue()
        ->and($store->revoked('jti-c'))->toBeFalse();
});

it('revokeSession() does not revoke tokens from other sessions', function (): void {
    $store = revocationStore();
    $expiresAt = time() + 900;

    $store->track('sid-001', 'jti-a', $expiresAt);
    $store->track('sid-002', 'jti-b', $expiresAt);

    $store->revokeSession('sid-001');

    expect($store->revoked('jti-b'))->toBeFalse();
});
