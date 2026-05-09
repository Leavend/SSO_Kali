<?php

declare(strict_types=1);

it('provides an operator-safe legacy sso-kali cleanup script', function (): void {
    $script = file_get_contents(legacy_cleanup_repository_path('scripts/vps-cleanup-legacy-sso-kali.sh'));

    expect($script)->toBeString()
        ->and($script)->toContain('EXECUTE="false"')
        ->and($script)->toContain('com.docker.compose.project=${PROJECT}')
        ->and($script)->toContain('check_prod_dependencies')
        ->and($script)->toContain('backup_legacy_postgres')
        ->and($script)->toContain('docker stop "${ids[@]}"')
        ->and($script)->not->toContain('docker system prune')
        ->and($script)->not->toContain('docker volume rm')
        ->and($script)->not->toContain('docker network rm');
});

it('documents the safe legacy sso-kali cleanup workflow', function (): void {
    $runbook = file_get_contents(legacy_cleanup_repository_path('docs/devops/sso-kali-legacy-cleanup.md'));

    expect($runbook)->toBeString()
        ->and($runbook)->toContain('Dry-Run Audit')
        ->and($runbook)->toContain('--execute')
        ->and($runbook)->toContain('Back up')
        ->and($runbook)->toContain('sso-backend-prod')
        ->and($runbook)->toContain('Do not run')
        ->and($runbook)->toContain('docker system prune -a --volumes')
        ->and($runbook)->toContain('7-14 days');
});

function legacy_cleanup_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
