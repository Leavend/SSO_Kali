<?php

declare(strict_types=1);

it('runs operational route optimization through the GitHub Actions deploy lifecycle', function (): void {
    $workflow = devOpsLifecycleOperationalRoutesFile('.github/workflows/deploy-main.yml');

    expect($workflow)
        ->toContain('vps-apply-sso-operational-route-optimization.sh')
        ->toContain('Install control files on VPS')
        ->toContain('Apply operational route optimization on VPS')
        ->toContain('sudo -n bash')
        ->toContain('--mode apply')
        ->toContain('SSO_APPLY_OPERATIONAL_ROUTE_OPTIMIZATION');
});

it('keeps the operational route optimization script idempotent for active VPS nginx blocks', function (): void {
    $script = devOpsLifecycleOperationalRoutesFile('scripts/vps-apply-sso-operational-route-optimization.sh');

    expect($script)
        ->toContain('replace_or_insert_location')
        ->toContain('location = /health')
        ->toContain('location = /ready')
        ->toContain('keys_zone=sso_operational_routes:10m')
        ->toContain('systemctl reload nginx')
        ->not->toContain('proxy_connect_timeout 1s')
        ->not->toContain('Existing block found');
});

it('rejects invalid oauth token and revocation methods at the nginx edge', function (): void {
    $script = devOpsLifecycleOperationalRoutesFile('scripts/vps-apply-sso-operational-route-optimization.sh');

    expect($script)
        ->toContain('oauth_method_guard_common')
        ->toContain('if ($request_method !~ ^(POST|OPTIONS)$)')
        ->toContain('return 405')
        ->toContain('location = /token')
        ->toContain('location = /oauth2/token')
        ->toContain('location = /revocation')
        ->toContain('location = /oauth2/revocation')
        ->toContain('location = /oauth/revoke')
        ->toContain('add_header Allow "POST, OPTIONS" always');
});

it('sheds hostile oauth write bursts at the nginx edge before upstream workers', function (): void {
    $script = devOpsLifecycleOperationalRoutesFile('scripts/vps-apply-sso-operational-route-optimization.sh');

    expect($script)
        ->toContain('zone=sso_oauth_write:10m rate=20r/s')
        ->toContain('limit_req zone=sso_oauth_write burst=40 nodelay')
        ->toContain('client_max_body_size 16k')
        ->toContain('client_body_timeout 5s')
        ->toContain('proxy_request_buffering on');
});

function devOpsLifecycleOperationalRoutesFile(string $relativePath): string
{
    $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, '/');

    return (string) file_get_contents($path);
}
