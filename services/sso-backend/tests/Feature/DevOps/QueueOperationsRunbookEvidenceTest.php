<?php

declare(strict_types=1);

it('documents failed-job operations, production log checks, and internal queue metrics safety', function (): void {
    $runbook = file_get_contents(queue_ops_repository_path('docs/devops/sso-backend-queue-operations.md'));

    expect($runbook)->toBeString()
        ->and($runbook)->toContain('sso.worker_boot')
        ->and($runbook)->toContain('sso.request_timing')
        ->and($runbook)->toContain('/_internal/queue-metrics')
        ->and($runbook)->toContain('SSO_INTERNAL_QUEUE_METRICS_ENABLED=false')
        ->and($runbook)->toContain('queue:retry')
        ->and($runbook)->toContain('Do not run docker system prune')
        ->and($runbook)->not->toContain('select * from failed_jobs');
});

function queue_ops_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
