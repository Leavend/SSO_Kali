<?php

declare(strict_types=1);

it('vps smoke verifies backend-only production topology after deployment', function (): void {
    $script = file_get_contents(runtime_verify_repository_path('scripts/sso-backend-vps-smoke.sh'));

    expect($script)->toBeString()
        ->and($script)->toContain('EXPECTED_SERVICES')
        ->and($script)->toContain('sso-backend-worker')
        ->and($script)->toContain('FORBIDDEN_SERVICES')
        ->and($script)->toContain('sso-admin-vue')
        ->and($script)->toContain('verify_topology')
        ->and($script)->toContain('verify_worker_logs');
});

function runtime_verify_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
