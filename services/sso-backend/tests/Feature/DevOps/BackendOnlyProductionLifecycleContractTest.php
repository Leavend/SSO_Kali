<?php

declare(strict_types=1);

it('keeps the main production deployment focused on baseline SSO services', function (): void {
    $workflow = issue31RepositoryFile('.github/workflows/deploy-main.yml');
    $script = issue31RepositoryFile('scripts/vps-deploy-main.sh');

    expect($workflow)->toContain('COMPOSE_PROJECT_NAME: sso-backend-prod')
        ->and($workflow)->toContain('sso-backend-deploy')
        ->and($workflow)->not->toContain('sso-kali-deploy')
        ->and($script)->toContain('COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sso-backend-prod}"')
        ->and($script)->toContain('compose up -d postgres redis')
        ->and($script)->toContain('compose up -d --remove-orphans sso-backend sso-backend-worker sso-backend-scheduler sso-frontend')
        ->and($script)->not->toContain('app-a-next')
        ->and($script)->not->toContain('app-b-laravel');
});

it('keeps baseline compose runtime free from removed legacy applications', function (string $file): void {
    $content = issue31RepositoryFile($file);

    expect($content)->toContain('sso-backend')
        ->and($content)->toMatch('/sso-(backend-)?worker/')
        ->and($content)->not->toContain('app-a-next:')
        ->and($content)->not->toContain('app-b-laravel:');
})->with([
    'docker-compose.main.yml',
    'docker-compose.sso-backend.yml',
]);

it('documents the backend-only production lifecycle boundary', function (): void {
    $content = issue31RepositoryFile('docs/devops/sso-backend-production-lifecycle.md');

    expect($content)->toContain('sso-backend-prod')
        ->and($content)->toContain('postgres')
        ->and($content)->toContain('redis')
        ->and($content)->toContain('sso-backend-worker')
        ->and($content)->toContain('legacy services intentionally excluded')
        ->and($content)->toContain('ghcr.io/leavend/sso-kali');
});

function issue31RepositoryFile(string $path): string
{
    return (string) file_get_contents(dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path);
}
