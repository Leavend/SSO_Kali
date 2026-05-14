<?php

declare(strict_types=1);

it('keeps main production compose on baseline SSO services without legacy apps', function (): void {
    $compose = file_get_contents(backend_topology_repository_path('docker-compose.main.yml'));

    expect($compose)->toBeString()
        ->and($compose)->toContain('sso-backend:')
        ->and($compose)->toContain('sso-backend-worker:')
        ->and($compose)->toContain('sso-frontend:')
        ->and($compose)->toContain('queue:work')
        ->and($compose)->toContain('postgres:')
        ->and($compose)->toContain('redis:')
        ->and($compose)->not->toContain('sso-admin-vue:')
        ->and($compose)->not->toContain('SSO_ADMIN_BIND');
});

it('deploys baseline production services and removes admin-vue orphans', function (): void {
    $deploy = file_get_contents(backend_topology_repository_path('scripts/vps-deploy-main.sh'));

    expect($deploy)->toBeString()
        ->and($deploy)->toContain('compose pull sso-backend')
        ->and($deploy)->toContain('sso-backend-worker')
        ->and($deploy)->toContain('sso-frontend')
        ->and($deploy)->toContain('compose up -d --remove-orphans sso-backend sso-backend-worker sso-frontend')
        ->and($deploy)->not->toContain('sso-admin-vue');
});

function backend_topology_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
