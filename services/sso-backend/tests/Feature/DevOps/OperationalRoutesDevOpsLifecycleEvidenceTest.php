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
        ->toContain('sudo -n nginx -t')
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
        ->not->toContain('Existing block found');
});

function devOpsLifecycleOperationalRoutesFile(string $relativePath): string
{
    $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, '/');

    return (string) file_get_contents($path);
}
