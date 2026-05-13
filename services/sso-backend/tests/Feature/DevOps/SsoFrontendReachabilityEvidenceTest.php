<?php

declare(strict_types=1);

/**
 * Regression guard for the 2026-05-13 incident where the atomic deploy
 * recreated the backend on network `sso-main` while sso-frontend-prod
 * stayed attached only to the pre-rename `sso-backend` network. nginx
 * in the frontend then returned HTTP 502 for every /api/auth/session
 * and /api/auth/login call.
 *
 * The fix is to make vps-deploy-main.sh reattach the sso-frontend-prod
 * container to the deploy network idempotently on every run, so any
 * compose recreate (which assigns a new IP) never loses reachability.
 */
it('reattaches the sso-frontend container to the backend network on every deploy', function (): void {
    $script = file_get_contents(frontend_reachability_file('scripts/vps-deploy-main.sh'));

    expect($script)->toBeString()
        ->and($script)->toContain('reattach_frontend_to_backend_network')
        ->and($script)->toContain('sso-frontend-prod')
        ->and($script)->toContain('docker network connect');
});

it('computes the deploy network name from COMPOSE_PROJECT_NAME and compose file', function (): void {
    $script = file_get_contents(frontend_reachability_file('scripts/vps-deploy-main.sh'));

    expect($script)
        ->toContain('COMPOSE_PROJECT_NAME')
        ->toContain('_sso-main');
});

it('keeps the docker-compose.main.yml network name in lockstep with the deploy script', function (): void {
    $compose = file_get_contents(frontend_reachability_file('docker-compose.main.yml'));
    $script = file_get_contents(frontend_reachability_file('scripts/vps-deploy-main.sh'));

    expect($compose)->toContain('sso-main:')
        ->and($compose)->toContain('driver: bridge')
        ->and($script)->toContain('sso-main');
});

function frontend_reachability_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
