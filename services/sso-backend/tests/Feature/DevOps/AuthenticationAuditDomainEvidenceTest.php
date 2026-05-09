<?php

declare(strict_types=1);

it('locks issue77 authentication audit domain model contracts', function (): void {
    $contracts = [
        'database/migrations/2026_05_10_000001_create_authentication_audit_events_table.php' => [
            'authentication_audit_events',
            'event_type',
            'subject_id',
            'client_id',
            'occurred_at',
        ],
        'app/Models/AuthenticationAuditEvent.php' => [
            'final class AuthenticationAuditEvent',
            'Authentication audit events are immutable.',
            'context',
            'occurred_at',
        ],
        'app/Actions/Audit/RecordAuthenticationAuditEventAction.php' => [
            'AuthenticationAuditEventStore',
            'AuthenticationAuditRedactor',
            'execute',
        ],
        'app/Services/Audit/AuthenticationAuditEventStore.php' => [
            'Str::ulid()',
            'AuthenticationAuditEvent::query()->create',
            'normalizedTimestamp',
        ],
        'app/Services/Audit/AuthenticationAuditRedactor.php' => [
            'password',
            'client_secret',
            '[REDACTED]',
        ],
        'app/Actions/Auth/LoginSsoUserAction.php' => [
            'login_failed',
            'login_succeeded',
            'identifier_hash',
            'RecordAuthenticationAuditEventAction',
        ],
        'tests/Feature/Auth/AuthenticationAuditDomainModelTest.php' => [
            'records failed login attempts without leaking credentials',
            'records successful login with subject and session context',
            'prevents authentication audit mutation and deletion',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue77_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue77 authentication audit tests wired into root ci', function (): void {
    $ci = issue77_file('../../.github/workflows/ci.yml');

    foreach ([
        'AuthenticationAuditDomainModelTest.php',
        'AuthenticationAuditDomainEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue77_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
