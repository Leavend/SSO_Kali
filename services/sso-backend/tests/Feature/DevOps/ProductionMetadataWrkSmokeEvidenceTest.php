<?php

declare(strict_types=1);

it('keeps metadata and jwks wrk smoke script reusable and secret-free', function (): void {
    $script = metadata_wrk_repository_file('scripts/sso-backend-metadata-wrk-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('WRK_THREADS')
        ->and($content)->toContain('WRK_CONNECTIONS')
        ->and($content)->toContain('WRK_DURATION')
        ->and($content)->toContain('--latency')
        ->and($content)->toContain('/jwks')
        ->and($content)->toContain('/.well-known/jwks.json')
        ->and($content)->toContain('/.well-known/openid-configuration')
        ->and($content)->toContain('wrk-results/sso-backend-metadata')
        ->and($content)->toContain('brew install wrk')
        ->and($content)->not->toContain('SSO_LOAD_TEST_CLIENT_SECRET')
        ->and($content)->not->toContain('client_secret');
});

it('records production metadata and jwks wrk evidence with follow-up tuning warnings', function (): void {
    $runbook = metadata_wrk_repository_file('docs/devops/sso-backend-metadata-wrk-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('No secrets are required')
        ->and($content)->toContain('2008.82')
        ->and($content)->toContain('2013.64')
        ->and($content)->toContain('1737.55')
        ->and($content)->toContain('PASS with warning')
        ->and($content)->toContain('connect 253')
        ->and($content)->toContain('timeout 34-37')
        ->and($content)->toContain('Nginx worker_connections')
        ->and($content)->toContain('proxy_http_version 1.1')
        ->and($content)->toContain('Octane/FrankenPHP workers')
        ->and($content)->toContain('metadata/JWKS throttle policy');
});

function metadata_wrk_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
