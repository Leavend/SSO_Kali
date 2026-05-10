<?php

declare(strict_types=1);

it('locks issue88 authentication audit observability implementation', function (): void {
    $contracts = [
        'app/Actions/Audit/RecordAuthenticationAuditEventAction.php' => [
            'Log::info',
            'Log::warning',
            '[SSO_AUTHENTICATION_AUDIT_PERSISTED]',
            '[SSO_AUTHENTICATION_AUDIT_PERSISTENCE_FAILED]',
            'event_id',
            'request_id',
            'client_id',
            'subject_id',
            'error_code',
        ],
        'app/Services/Audit/AuthenticationAuditRedactor.php' => [
            'access_token',
            'refresh_token',
            'id_token',
            'client_secret',
            '[REDACTED]',
        ],
        'app/Console/Commands/PruneAuthenticationAuditEvents.php' => [
            'Authentication audit retention days',
            'Authentication audit cutoff',
            'Authentication audit prune candidate row(s)',
            'Dry run enabled; no authentication audit rows were pruned.',
        ],
        'tests/Feature/Auth/AuthenticationAuditObservabilityEvidenceContractTest.php' => [
            'emits structured authentication audit persistence logs with correlation identifiers',
            'emits structured authentication audit failure logs without leaking sensitive context',
            'exposes retention command observability output for compliance operations',
            'issue88-access-token-must-not-leak',
            'issue88-refresh-token-must-not-leak',
            'not->toContain',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue88_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue88 authentication audit observability tests wired into root ci', function (): void {
    $ci = issue88_file('../../.github/workflows/ci.yml');

    foreach ([
        'AuthenticationAuditObservabilityEvidenceContractTest.php',
        'AuthenticationAuditObservabilityEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue88_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
