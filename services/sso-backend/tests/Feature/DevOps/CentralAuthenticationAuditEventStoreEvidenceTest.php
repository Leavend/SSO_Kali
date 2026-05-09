<?php

declare(strict_types=1);

it('locks issue78 central authentication audit event store contracts', function (): void {
    $contracts = [
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'final readonly class AuthenticationAuditRecord',
            'loginSucceeded',
            'loginFailed',
            'toPayload',
        ],
        'app/Actions/Audit/RecordAuthenticationAuditEventAction.php' => [
            'AuthenticationAuditRecord $record',
            'AuthenticationAuditRedactor',
            'redacted',
        ],
        'app/Services/Audit/AuthenticationAuditEventStore.php' => [
            'append(AuthenticationAuditRecord $record)',
            'AuthenticationAuditEvent::query()->create',
            'payload(AuthenticationAuditRecord $record)',
        ],
        'app/Actions/Auth/LoginSsoUserAction.php' => [
            'AuthenticationAuditRecord::loginFailed',
            'AuthenticationAuditRecord::loginSucceeded',
            'identifierContext',
        ],
        'tests/Feature/Auth/CentralAuthenticationAuditEventStoreTest.php' => [
            'centralizes typed authentication audit persistence',
            'provides named factories for login audit event producers',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue78_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue78 central store tests wired into root ci', function (): void {
    $ci = issue78_file('../../.github/workflows/ci.yml');

    foreach ([
        'CentralAuthenticationAuditEventStoreTest.php',
        'CentralAuthenticationAuditEventStoreEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue78_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
