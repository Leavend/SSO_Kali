<?php

declare(strict_types=1);

it('issue 1 tracks the public metadata app-cache tests as TDD evidence', function (): void {
    $testFile = oidcTddEvidenceFile('services/sso-backend/tests/Feature/Oidc/PublicMetadataCachingIssueTest.php');

    expect($testFile)
        ->toContain('issue 1 caches discovery metadata generation by configuration-aware cache key')
        ->toContain('Cache::has(discoveryCacheKeyForCurrentConfig())')
        ->toContain("config(['sso.issuer' => 'https://sso.changed.example.com'])");
});

it('issue 2 tracks the shared JWKS app-cache path as TDD evidence', function (): void {
    $testFile = oidcTddEvidenceFile('services/sso-backend/tests/Feature/Oidc/PublicMetadataCachingIssueTest.php');

    expect($testFile)
        ->toContain('issue 2 caches canonical and compatibility JWKS responses through one app cache key')
        ->toContain("Cache::has('oidc:public-metadata:jwks')")
        ->toContain("\$this->getJson('/.well-known/jwks.json')")
        ->toContain("\$this->getJson('/jwks')");
});

it('issue 3 tracks public cache control headers as TDD evidence', function (): void {
    $testFile = oidcTddEvidenceFile('services/sso-backend/tests/Feature/Oidc/PublicMetadataCachingIssueTest.php');

    expect($testFile)
        ->toContain('issue 3 exposes public max age and stale while revalidate cache control headers')
        ->toContain("assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=60')")
        ->toContain("'/.well-known/openid-configuration'")
        ->toContain("'/.well-known/jwks.json'")
        ->toContain("'/jwks'");
});

it('issue 4 tracks nginx edge cache and shared JWKS cache key as TDD evidence', function (): void {
    $testFile = oidcTddEvidenceFile('services/sso-backend/tests/Feature/Oidc/PublicMetadataCachingIssueTest.php');
    $nginxConfig = oidcTddEvidenceFile('deploy/nginx/nginx-sso-backend-edge.conf');
    $vpsScript = oidcTddEvidenceFile('scripts/vps-enable-sso-oidc-edge-cache.sh');

    expect($testFile)
        ->toContain('issue 4 documents nginx edge cache sharing for both JWKS URLs')
        ->toContain('proxy_cache_key "$scheme://$host/.well-known/jwks.json"');

    expect($nginxConfig)
        ->toContain('proxy_cache sso_oidc_metadata')
        ->toContain('proxy_cache_valid 200 5m')
        ->toContain('proxy_cache_key "$scheme://$host/.well-known/jwks.json"')
        ->toContain('max-age=300, stale-while-revalidate=60');

    expect($vpsScript)
        ->toContain('replace_or_insert_location')
        ->toContain('proxy_cache_key "$scheme://$host/.well-known/jwks.json"')
        ->toContain('max-age=300, stale-while-revalidate=60');
});

function oidcTddEvidenceFile(string $relativePath): string
{
    $repositoryRoot = dirname(base_path(), 2);
    $candidate = $repositoryRoot.DIRECTORY_SEPARATOR.ltrim($relativePath, '/');

    expect($candidate)->toBeFile();

    return (string) file_get_contents($candidate);
}
