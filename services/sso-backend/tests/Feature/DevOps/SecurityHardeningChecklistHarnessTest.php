<?php

declare(strict_types=1);

it('keeps the production security hardening checklist penetration-style and audit-ready', function (): void {
    $checklist = file_get_contents(security_checklist_repository_path('docs/security/sso-backend-production-checklist.md'));

    expect($checklist)->toBeString()
        ->and($checklist)->toContain('Penetration-Style Checklist')
        ->and($checklist)->toContain('APP_DEBUG=false')
        ->and($checklist)->toContain('SSO_INTERNAL_QUEUE_METRICS_ENABLED=false')
        ->and($checklist)->toContain('X-Request-Id')
        ->and($checklist)->toContain('curl -fsS https://api-sso.timeh.my.id/ready')
        ->and($checklist)->toContain('No wildcard production redirect URIs')
        ->and($checklist)->toContain('No localhost redirect URIs')
        ->and($checklist)->toContain('Do not run docker system prune')
        ->and($checklist)->toContain('Backups and restore rehearsal evidence captured')
        ->and($checklist)->toContain('sso-backend-prod-sso-backend-worker-1')
        ->and($checklist)->toContain('Pass/Fail Evidence')
        ->and($checklist)->not->toContain('sso-admin-vue');
});

function security_checklist_repository_path(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
