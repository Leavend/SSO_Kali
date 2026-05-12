<?php

declare(strict_types=1);

use App\Services\Oidc\OidcCatalog;
use App\Services\Oidc\SigningKeyService;
use Illuminate\Support\Facades\Cache;

it('issue 1 caches discovery metadata generation by configuration-aware cache key', function (): void {
    Cache::flush();

    $catalog = new OidcCatalog(app(SigningKeyService::class));

    $firstDiscovery = $catalog->discovery();
    $secondDiscovery = $catalog->discovery();

    expect($secondDiscovery)->toBe($firstDiscovery)
        ->and(Cache::has(discoveryCacheKeyForCurrentConfig()))->toBeTrue();

    config(['sso.issuer' => 'https://sso.changed.example.com']);

    expect($catalog->discovery()['issuer'])->toBe('https://sso.changed.example.com')
        ->and(Cache::has(discoveryCacheKeyForCurrentConfig()))->toBeTrue();
});

it('issue 2 caches canonical and compatibility JWKS responses through one app cache key', function (): void {
    Cache::flush();

    expect(Cache::has('oidc:public-metadata:jwks'))->toBeFalse();

    $wellKnown = $this->getJson('/.well-known/jwks.json')->assertOk();
    $compatibility = $this->getJson('/jwks')->assertOk();

    expect(Cache::has('oidc:public-metadata:jwks'))->toBeTrue()
        ->and($compatibility->json())->toBe($wellKnown->json());
});

it('issue 3 exposes public max age and stale while revalidate cache control headers', function (string $uri): void {
    $this->getJson($uri)
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=60')
        ->assertHeaderMissing('Pragma');
})->with([
    'discovery' => ['/.well-known/openid-configuration'],
    'well-known jwks' => ['/.well-known/jwks.json'],
    'compatibility jwks' => ['/jwks'],
]);

it('issue 4 documents nginx edge cache sharing for both JWKS URLs', function (): void {
    $nginxConfig = (string) file_get_contents(dirname(base_path(), 2).'/deploy/nginx/nginx-sso-backend-edge.conf');

    expect($nginxConfig)
        ->toContain('proxy_cache sso_oidc_metadata')
        ->toContain('location = /.well-known/jwks.json')
        ->toContain('location = /jwks')
        ->toContain('proxy_cache_key "$scheme://$host/.well-known/jwks.json"')
        ->toContain('stale-while-revalidate=60');
});

function discoveryCacheKeyForCurrentConfig(): string
{
    return 'oidc:public-metadata:discovery:'.hash('xxh128', json_encode([
        'issuer' => config('sso.issuer'),
        'base_url' => config('sso.base_url'),
        'alg' => config('sso.signing.alg'),
        'scopes' => config('sso.default_scopes'),
    ], JSON_THROW_ON_ERROR));
}
