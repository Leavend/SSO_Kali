<?php

declare(strict_types=1);

it('locks issue85 admin authentication audit api implementation', function (): void {
    $contracts = [
        'app/Http/Controllers/Admin/AuthenticationAuditController.php' => [
            'ListAuthenticationAuditEventsRequest',
            'AdminAuthenticationAuditQuery',
            'AdminAuthenticationAuditPresenter',
            'Authentication audit event not found.',
        ],
        'app/Http/Requests/Admin/ListAuthenticationAuditEventsRequest.php' => [
            'event_type',
            'subject_id',
            'client_id',
            'session_id',
            'request_id',
            'error_code',
        ],
        'app/Services/Admin/AdminAuthenticationAuditQuery.php' => [
            'AuthenticationAuditEvent',
            'cursorPaginate',
            'MAX_LIMIT = 100',
            'where(\'event_id\'',
        ],
        'app/Services/Admin/AdminAuthenticationAuditPresenter.php' => [
            'AuthenticationAuditEvent',
            'subject',
            'request',
            'redact',
            "'authorization'",
            "'token'",
            "'[redacted]'",
        ],
        'routes/admin.php' => [
            'AuthenticationAuditController',
            '/audit/authentication-events',
            'AdminPermission::AUDIT_READ',
        ],
        'tests/Feature/Admin/AdminAuthenticationAuditApiContractTest.php' => [
            'requires admin audit read permission for authentication audit access',
            'lists filters and paginates central authentication audit events safely',
            'shows one central authentication audit event and returns not found for unknown event ids',
            'raw-access-token-must-not-leak-85',
            'raw-id-token-must-not-leak-85',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue85_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue85 admin authentication audit api tests wired into root ci', function (): void {
    $ci = issue85_file('../../.github/workflows/ci.yml');

    foreach ([
        'AdminAuthenticationAuditApiContractTest.php',
        'AdminAuthenticationAuditApiEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue85_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
