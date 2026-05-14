<?php

declare(strict_types=1);

it('deploys the production frontend from the same immutable GHCR release as backend services', function (): void {
    $workflow = prod_deploy_contract_file('.github/workflows/deploy-main.yml');
    $compose = prod_deploy_contract_file('docker-compose.main.yml');
    $script = prod_deploy_contract_file('scripts/vps-deploy-main.sh');

    expect($workflow)->toContain('service: sso-frontend')
        ->and($workflow)->toContain('context: ./')
        ->and($workflow)->toContain('dockerfile: ./services/sso-frontend/Dockerfile')
        ->and($workflow)->toContain('DEPLOY_TAG=')
        ->and($workflow)->not->toContain('docker compose pull sso-frontend')
        ->and($compose)->toContain('sso-frontend:')
        ->and($compose)->toContain('ghcr.io/leavend/sso-kali}/sso-frontend:${SSO_DEPLOY_TAG:-main}')
        ->and($compose)->toContain('container_name: ${SSO_FRONTEND_CONTAINER:-sso-frontend-prod}')
        ->and($compose)->toContain('SSO_BACKEND_UPSTREAM: sso-backend:8000')
        ->and($script)->toContain('compose pull sso-backend sso-backend-worker sso-frontend')
        ->and($script)->toContain('adopt_legacy_frontend_container')
        ->and($script)->toContain('docker rm -f "$frontend_container"')
        ->and($script)->toContain('compose up -d --remove-orphans sso-backend sso-backend-worker sso-frontend')
        ->and($script)->toContain('wait_for_service sso-frontend')
        ->and($script)->toContain('verify_frontend_release');
});

it('keeps the legacy standalone frontend workflow out of production deploy responsibilities', function (): void {
    $workflow = prod_deploy_contract_file('.github/workflows/sso-frontend.yml');

    expect($workflow)->toContain('Quality Gate')
        ->and($workflow)->toContain('Build')
        ->and($workflow)->not->toContain('Deploy via SSH')
        ->and($workflow)->not->toContain('docker compose pull sso-frontend')
        ->and($workflow)->not->toContain('docker compose up -d sso-frontend');
});

function prod_deploy_contract_file(string $path): string
{
    return (string) file_get_contents(dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path);
}
