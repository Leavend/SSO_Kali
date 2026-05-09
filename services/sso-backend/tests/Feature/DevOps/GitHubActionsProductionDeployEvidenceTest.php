<?php

declare(strict_types=1);

it('keeps production deploy fully GitHub Actions driven and aligned with main topology', function (): void {
    $workflow = file_get_contents(issue8_repository_path('.github/workflows/sso-backend-deploy.yml'));
    $mainDeploy = file_get_contents(issue8_repository_path('scripts/vps-deploy-main.sh'));

    expect($workflow)->toBeString()
        ->and($workflow)->toContain('environment: production')
        ->and($workflow)->toContain('concurrency:')
        ->and($workflow)->toContain('docker-compose.main.yml')
        ->and($workflow)->toContain('scripts/vps-deploy-main.sh')
        ->and($workflow)->toContain('scripts/sso-backend-vps-smoke.sh')
        ->and($workflow)->toContain('--public-base-url')
        ->and($workflow)->toContain('--compose-file "${{ env.VPS_PROJECT_DIR }}/docker-compose.main.yml"')
        ->and($workflow)->not->toContain('docker-compose.sso-backend.yml')
        ->and($workflow)->not->toContain('vps-deploy-sso-backend.sh')
        ->and($mainDeploy)->toContain('sso-backend-worker')
        ->and($mainDeploy)->toContain('--remove-orphans');
});

function issue8_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
