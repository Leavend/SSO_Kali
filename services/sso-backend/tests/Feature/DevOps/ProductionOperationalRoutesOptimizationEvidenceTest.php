<?php

declare(strict_types=1);

it('optimizes health as an edge static operational route', function (): void {
    $config = operationalRouteOptimizationContents('../../deploy/nginx/nginx-sso-backend-edge.conf');
    $block = operationalRouteBlock($config, 'location = /health');

    expect($block)
        ->toContain('return 200')
        ->toContain('"edge":"nginx"')
        ->toContain('Cache-Control "no-store"')
        ->toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"')
        ->toContain('Content-Security-Policy "default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'"')
        ->toContain('X-Frame-Options "DENY"')
        ->toContain('X-Content-Type-Options "nosniff"')
        ->not->toContain('proxy_pass');
});

it('keeps static edge liveness protected by security headers', function (): void {
    $config = operationalRouteOptimizationContents('../../deploy/nginx/nginx-sso-backend-edge.conf');
    $block = operationalRouteBlock($config, 'location = /up');

    expect($block)
        ->toContain('return 200')
        ->toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"')
        ->toContain('Content-Security-Policy "default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'"')
        ->toContain('X-Frame-Options "DENY"')
        ->toContain('X-Content-Type-Options "nosniff"');
});

it('microcaches readiness to absorb dependency-check bursts', function (): void {
    $config = operationalRouteOptimizationContents('../../deploy/nginx/nginx-sso-backend-edge.conf');
    $block = operationalRouteBlock($config, 'location = /ready');

    expect($config)->toContain('keys_zone=sso_operational_routes:10m');
    expect($block)
        ->toContain('proxy_cache sso_operational_routes')
        ->toContain('proxy_cache_valid 200 1s')
        ->toContain('proxy_cache_valid 503 1s')
        ->toContain('proxy_cache_lock on')
        ->toContain('proxy_connect_timeout 1s')
        ->toContain('add_header X-Edge-Cache $upstream_cache_status always');
});

it('microcaches protected internal metrics for approved monitoring only', function (): void {
    $config = operationalRouteOptimizationContents('../../deploy/nginx/nginx-sso-backend-edge.conf');

    foreach (['location = /_internal/performance-metrics', 'location = /_internal/queue-metrics'] as $location) {
        $block = operationalRouteBlock($config, $location);

        expect($block)
            ->toContain('allow 127.0.0.1')
            ->toContain('deny all')
            ->toContain('proxy_cache sso_operational_routes')
            ->toContain('proxy_cache_valid 200 1s')
            ->toContain('proxy_cache_valid 403 1s')
            ->toContain('proxy_cache_lock on')
            ->toContain('add_header X-Edge-Cache $upstream_cache_status always');
    }
});

it('keeps application readiness lightweight by default', function (): void {
    $service = operationalRouteOptimizationContents('app/Services/System/ReadinessProbeService.php');
    $config = operationalRouteOptimizationContents('config/sso.php');

    expect($config)
        ->toContain('SSO_READINESS_QUEUE_SNAPSHOT_ENABLED')
        ->toContain('SSO_READINESS_EXTERNAL_IDP_SNAPSHOT_ENABLED');

    expect($service)
        ->toContain("readiness_queue_snapshot_enabled', false")
        ->toContain("readiness_external_idp_snapshot_enabled', false")
        ->toContain('$this->databaseIsReady()')
        ->toContain('$this->redisIsReady()');
});

it('ships an active VPS apply script for live nginx optimization', function (): void {
    $script = operationalRouteOptimizationContents('../../scripts/vps-apply-sso-operational-route-optimization.sh');

    expect($script)
        ->toContain('--mode audit|apply')
        ->toContain('api-sso.timeh.my.id.conf')
        ->toContain('sso_operational_routes')
        ->toContain('edge_security_headers')
        ->toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"')
        ->toContain('nginx -t')
        ->toContain('systemctl reload nginx')
        ->toContain('pre-op-route-optimization');
});

it('documents production security header layer ownership and verification', function (): void {
    $document = operationalRouteOptimizationContents('../../docs/security/security-header-layers.md');
    $checklist = operationalRouteOptimizationContents('../../docs/security/sso-backend-production-checklist.md');

    expect($document)
        ->toContain('Backend API `api-sso.timeh.my.id`')
        ->toContain('Static edge routes such as `/up` and `/health` must set headers themselves')
        ->toContain('curl -fsSI https://api-sso.timeh.my.id/health');

    expect($checklist)
        ->toContain('docs/security/security-header-layers.md')
        ->toContain('strict-transport-security|content-security-policy');
});

function operationalRouteOptimizationContents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}

function operationalRouteBlock(string $contents, string $needle): string
{
    $start = strpos($contents, $needle);
    expect($start)->not->toBeFalse();

    $end = strpos($contents, "\n}\n", (int) $start);
    expect($end)->not->toBeFalse();

    return substr($contents, (int) $start, ((int) $end - (int) $start) + 3);
}
