<?php

declare(strict_types=1);

it('keeps the production backup restore runbook aligned with backend-only stack safety', function (): void {
    $runbook = file_get_contents(backup_restore_repository_path('docs/devops/sso-backend-backup-restore.md'));

    expect($runbook)->toBeString()
        ->and($runbook)->toContain('/opt/sso-backend-prod')
        ->and($runbook)->toContain('docker-compose.main.yml')
        ->and($runbook)->toContain('sso-backend-prod-postgres-1')
        ->and($runbook)->toContain('pg_dump')
        ->and($runbook)->toContain('pg_restore')
        ->and($runbook)->toContain('sha256sum -c SHA256SUMS')
        ->and($runbook)->toContain('restore rehearsal')
        ->and($runbook)->toContain('sso-backend-vps-smoke.sh')
        ->and($runbook)->toContain('Do not run docker system prune')
        ->and($runbook)->not->toContain('docker-compose.sso-backend.yml');
});

function backup_restore_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
