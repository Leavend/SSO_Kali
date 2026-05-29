<?php

declare(strict_types=1);

it('renames the admin frontend service across package compose workflows and deploy scripts', function (): void {
    $root = admin_frontend_repository_path('');

    expect($root.'services/sso-admin-frontend/package.json')->toBeFile()
        ->and($root.'services/sso-admin-vue')->not->toBeDirectory();

    $package = json_decode(file_get_contents($root.'services/sso-admin-frontend/package.json'), true, flags: JSON_THROW_ON_ERROR);
    $lockfile = json_decode(file_get_contents($root.'services/sso-admin-frontend/package-lock.json'), true, flags: JSON_THROW_ON_ERROR);

    expect($package['name'])->toBe('sso-admin-frontend')
        ->and($lockfile['name'])->toBe('sso-admin-frontend')
        ->and($lockfile['packages']['']['name'])->toBe('sso-admin-frontend');

    $compose = file_get_contents($root.'docker-compose.dev.yml');
    expect($compose)->toContain('sso-admin-frontend:')
        ->and($compose)->toContain('sso-dev-sso-admin-frontend:${APP_IMAGE_TAG:-local}')
        ->and($compose)->toContain('context: ./services/sso-admin-frontend')
        ->and($compose)->toContain('traefik.http.routers.sso-admin-frontend.priority=175')
        ->and($compose)->toContain('VITE_PUBLIC_BASE_PATH: ${SSO_ADMIN_FRONTEND_BASE_PATH:-${SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview}}')
        ->and($compose)->toContain('traefik.http.routers.sso-admin-frontend.rule=Host(`${SSO_ADMIN_DOMAIN:-admin-sso.timeh.my.id}`)');

    $files = [
        '.github/workflows/ci.yml',
        '.github/workflows/deploy-main.yml',
        '.github/workflows/devops-lifecycle.yml',
        '.github/workflows/vps-maintenance.yml',
        'scripts/vps-deploy.sh',
        'scripts/vps-rollback.sh',
        'scripts/vps-direct-build-deploy.sh',
        'scripts/vps-apply-sso-efficiency-profile.sh',
        'scripts/vps-update-sso-runtime-budget.sh',
        'scripts/wait-for-ghcr-images.sh',
        'scripts/validate-devops-lifecycle.sh',
        'scripts/validate-laravel-vue-lifecycle.sh',
        'infra/ansible/group_vars/sso_vps.yml',
        'infra/terraform/environments/dev-sso/variables.tf',
    ];

    foreach ($files as $file) {
        $contents = file_get_contents($root.$file);

        expect($contents)->toContain('sso-admin-frontend');
    }
});

function admin_frontend_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
