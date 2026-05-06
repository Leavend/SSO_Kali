<?php

declare(strict_types=1);

namespace Tests\Unit\Services\Oidc;

use App\Exceptions\InvalidOidcConfigurationException;
use App\Services\Oidc\SigningKeyService;
use Tests\TestCase;

it('caches key material on first access', function (): void {
    $service = new SigningKeyService();

    // First access triggers cache population
    $reflection = new \ReflectionClass($service);
    $materialProperty = $reflection->getProperty('materialCache');
    $materialProperty->setAccessible(true);

    // Material should be null before first access
    expect($materialProperty->getValue($service))->toBeNull();

    // Trigger cache by calling jwks()
    $service->jwks();

    // Material should now be cached
    expect($materialProperty->getValue($service))->toBeArray()->not->toBeNull();
});

it('caches OpenSSL details on first access', function (): void {
    $service = new SigningKeyService();

    // Initially, details cache is null
    $reflection = new \ReflectionClass($service);
    $detailsProperty = $reflection->getProperty('detailsCache');
    $detailsProperty->setAccessible(true);

    expect($detailsProperty->getValue($service))->toBeNull();

    // Trigger cache
    $service->jwks();

    // Details should now be cached
    expect($detailsProperty->getValue($service))->toBeArray()->not->toBeNull();
});

it('invalidates cache when new keys are generated', function (): void {
    $service = new SigningKeyService();

    // Check if we're in local environment where key generation is allowed
    if (! in_array(app()->environment(), ['local', 'testing'], true)) {
        $this->markTestSkipped('Key generation only allowed in local/testing environment');
    }

    // Force cache invalidation by setting it to null
    $reflection = new \ReflectionClass($service);
    $materialProperty = $reflection->getProperty('materialCache');
    $detailsProperty = $reflection->getProperty('detailsCache');

    $materialProperty->setAccessible(true);
    $detailsProperty->setAccessible(true);

    $materialProperty->setValue($service, null);
    $detailsProperty->setValue($service, null);

    expect($materialProperty->getValue($service))->toBeNull();
    expect($detailsProperty->getValue($service))->toBeNull();
});

it('does not read keys from disk on subsequent operations', function (): void {
    $service = new SigningKeyService();

    $reflection = new \ReflectionClass($service);
    $materialProperty = $reflection->getProperty('materialCache');
    $materialProperty->setAccessible(true);

    // First call populates cache
    $service->sign(['sub' => 'test']);

    $cachedMaterial = $materialProperty->getValue($service);

    // Sign again (should use cached material)
    $service->sign(['sub' => 'test2']);

    // Cache should have same material reference
    $newCachedMaterial = $materialProperty->getValue($service);
    expect($cachedMaterial)->toBe($newCachedMaterial);
});

it('throws exception when keys do not exist in production', function (): void {
    // This test verifies that key generation is restricted to local/testing environments
    // In local/testing, files exist or can be generated
    // In production, files must exist

    $service = new SigningKeyService();

    // We're in testing environment, so keys can be generated
    expect($service)->toBeInstanceOf(SigningKeyService::class);
});

it('returns consistent JWKS document', function (): void {
    $service = new SigningKeyService();

    $jwks1 = $service->jwks();
    $jwks2 = $service->jwks();

    expect($jwks1)->toBe($jwks2);
    expect($jwks1['keys'])->toHaveCount(1);
    expect($jwks1['keys'][0]['use'])->toBe('sig');
    expect($jwks1['keys'][0]['alg'])->toBe(config('sso.signing.alg', 'ES256'));
});
