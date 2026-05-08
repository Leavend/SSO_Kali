<?php

declare(strict_types=1);

it('emits a worker boot marker before running the queue worker', function (): void {
    $entrypoint = file_get_contents(worker_boot_repository_path('services/sso-backend/docker/frankenphp/entrypoint.sh'));

    expect($entrypoint)->toBeString()
        ->and($entrypoint)->toContain('sso.worker_boot')
        ->and($entrypoint)->toContain('queue:work')
        ->and($entrypoint)->toContain('php artisan queue:work');
});

function worker_boot_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
