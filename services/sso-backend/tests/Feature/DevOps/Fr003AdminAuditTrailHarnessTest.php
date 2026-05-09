<?php

declare(strict_types=1);

it('locks issue45 admin audit trail backend contracts', function (): void {
    $contracts = [
        'app/Services/Admin/AdminAuditTrailQuery.php' => [
            'final class AdminAuditTrailQuery',
            'cursorPaginate',
            'MAX_LIMIT = 100',
        ],
        'app/Services/Admin/AdminAuditTrailPresenter.php' => [
            'final class AdminAuditTrailPresenter',
            'hash_chain',
            '[redacted]',
        ],
        'app/Services/Admin/AdminAuditIntegrityVerifier.php' => [
            'final class AdminAuditIntegrityVerifier',
            'broken_event_id',
            'checked_events',
        ],
        'app/Http/Controllers/Admin/AuditTrailController.php' => [
            'function index',
            'function show',
            'function integrity',
        ],
        'app/Http/Requests/Admin/ListAuditEventsRequest.php' => [
            'max:100',
            'after_or_equal:from',
        ],
        'routes/admin.php' => [
            "Route::get('/audit/events'",
            "Route::get('/audit/integrity'",
            'AdminPermission::AUDIT_READ',
        ],
        'tests/Feature/Admin/AdminAuditTrailContractTest.php' => [
            'requires admin audit read permission',
            'verifies audit hash chain integrity',
            'secret-token',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue45_file($relativePath);

        expect($content, "{$relativePath} must exist")->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content, "{$relativePath} must contain {$needle}")->toContain($needle);
        }
    }
});

it('keeps issue45 audit trail tests wired into root ci', function (): void {
    $ci = issue45_file('../../.github/workflows/ci.yml');

    foreach ([
        'AdminAuditTrailContractTest.php',
        'Fr003AdminAuditTrailHarnessTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue45_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
