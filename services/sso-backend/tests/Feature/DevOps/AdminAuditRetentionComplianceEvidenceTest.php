<?php

declare(strict_types=1);

it('locks admin audit retention scheduler evidence', function (): void {
    $console = (string) file_get_contents(base_path('routes/console.php'));
    $command = (string) file_get_contents(base_path('app/Console/Commands/PruneAdminAuditEventsCommand.php'));

    expect($console)
        ->toContain("Schedule::command('sso:prune-admin-audit-events')->daily()->withoutOverlapping()")
        ->and($command)->toContain('sso:prune-admin-audit-events')
        ->and($command)->toContain('--dry-run')
        ->and($command)->toContain('MIN_RETENTION_DAYS = 365');
});
