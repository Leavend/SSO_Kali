<?php

declare(strict_types=1);

it('keeps production lifecycle free from removed legacy gates', function (): void {
    $files = [
        '.github/workflows/ci.yml',
        '.github/workflows/devops-lifecycle.yml',
        'scripts/validate-devops-lifecycle.sh',
        'services/sso-backend/tests/Feature/DevOps/BackendOnlyProductionLifecycleContractTest.php',
        'docs/devops/sso-backend-production-lifecycle.md',
    ];

    foreach ($files as $file) {
        $content = file_get_contents(backend_lifecycle_repository_file($file));

        expect($content)->toBeString()
            ->and($content)->not->toContain('services/sso-frontend')
            ->and($content)->not->toContain('infra/sso-frontend')
            ->and($content)->not->toContain('packages/dev-sso-parent-ui')
            ->and($content)->not->toContain('apps/app-a-next')
            ->and($content)->not->toContain('apps/app-b-laravel');
    }
});

it('targets sso-backend-prod instead of legacy compose project names', function (): void {
    $files = [
        '.github/workflows/deploy-main.yml',
        'scripts/vps-deploy-main.sh',
        'scripts/sso-backend-vps-smoke.sh',
        'docs/devops/sso-backend-cicd.md',
        'docs/devops/sso-backend-production-lifecycle.md',
    ];

    foreach ($files as $file) {
        $content = file_get_contents(backend_lifecycle_repository_file($file));

        expect($content)->toBeString()
            ->and($content)->toContain('sso-backend-prod')
            ->and($content)->not->toContain('/opt/sso-kali')
            ->and($content)->not->toContain('/tmp/sso-kali-deploy')
            ->and($content)->not->toContain('COMPOSE_PROJECT_NAME:-sso-kali')
            ->and($content)->not->toContain('COMPOSE_PROJECT_NAME=sso-kali');
    }
});

function backend_lifecycle_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
