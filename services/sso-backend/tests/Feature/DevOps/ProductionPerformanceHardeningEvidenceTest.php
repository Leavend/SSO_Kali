<?php

declare(strict_types=1);

it('locks PO1 to protect internal metrics at the nginx edge', function (): void {
    $config = productionPerformanceHardeningContents('../../deploy/nginx/nginx-sso-backend-edge.conf');

    expect($config)
        ->toContain('location = /_internal/performance-metrics')
        ->toContain('location = /_internal/queue-metrics')
        ->toContain('allow 127.0.0.1;')
        ->toContain('allow ::1;')
        ->toContain('deny all;')
        ->toContain('proxy_connect_timeout 2s')
        ->toContain('proxy_read_timeout 10s');
});

it('locks PO2 to keep up as an edge static liveness endpoint', function (): void {
    $config = productionPerformanceHardeningContents('../../deploy/nginx/nginx-sso-backend-edge.conf');

    expect($config)
        ->toContain('location = /up')
        ->toContain('access_log off;')
        ->toContain('return 200 "ok\\n";')
        ->toContain('Cache-Control "no-store"');

    $upBlock = productionPerformanceBlock($config, 'location = /up');
    expect($upBlock)->not->toContain('proxy_pass');
});

it('locks PO3 to keep docker healthchecks on up only', function (): void {
    foreach (['../../docker-compose.sso-backend.yml', '../../docker-compose.main.yml'] as $file) {
        $compose = productionPerformanceHardeningContents($file);

        expect($compose)
            ->toContain('curl -fsS http://127.0.0.1:8000/up || exit 1')
            ->not->toContain('curl -fsS http://127.0.0.1:8000/health || curl -fsS http://127.0.0.1:8000/.well-known/openid-configuration');
    }
});

it('locks PO4 metadata and jwks edge cache safeguards', function (): void {
    $config = productionPerformanceHardeningContents('../../deploy/nginx/nginx-sso-backend-edge.conf');

    expect($config)
        ->toContain('proxy_cache_path /var/cache/nginx/sso_oidc_metadata')
        ->toContain('proxy_cache_lock on;')
        ->toContain('proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;')
        ->toContain('proxy_ignore_headers Set-Cookie Cache-Control Expires;')
        ->toContain('proxy_hide_header Set-Cookie;')
        ->toContain('add_header X-Edge-Cache $upstream_cache_status always;')
        ->toContain('proxy_buffer_size 16k;')
        ->toContain('proxy_buffers 16 16k;');
});

it('locks PO5 scaling readiness and wrk grouping documentation', function (): void {
    $runbook = productionPerformanceHardeningContents('../../docs/devops/sso-backend-production-performance-hardening.md');

    expect($runbook)
        ->toContain('docker compose')
        ->toContain('--scale sso-backend=2')
        ->toContain('--scale sso-backend=1')
        ->toContain('High-RPS safe group')
        ->toContain('Low-RPS dependency group')
        ->toContain('Do not public-load `/_internal/*`');
});

function productionPerformanceHardeningContents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}

function productionPerformanceBlock(string $contents, string $needle): string
{
    $start = strpos($contents, $needle);
    expect($start)->not->toBeFalse();

    $end = strpos($contents, "\n}\n", (int) $start);
    expect($end)->not->toBeFalse();

    return substr($contents, (int) $start, ((int) $end - (int) $start) + 3);
}
