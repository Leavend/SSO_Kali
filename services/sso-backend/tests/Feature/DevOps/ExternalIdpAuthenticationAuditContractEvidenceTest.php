<?php

declare(strict_types=1);

it('locks issue84 external idp authentication audit contract implementation', function (): void {
    $contracts = [
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'externalIdpAuthentication',
        ],
        'app/Actions/ExternalIdp/CreateExternalIdpAuthenticationRedirectAction.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::externalIdpAuthentication',
            'external_idp_redirect_created',
            'external_idp_redirect_failed',
            'issuer_hash',
            'return_to_hash',
            "hash('sha256'",
        ],
        'app/Actions/ExternalIdp/ExchangeExternalIdpCallbackTokenAction.php' => [
            'RecordAuthenticationAuditEventAction',
            'external_idp_callback_exchanged',
            'external_idp_callback_failed',
            'state_hash',
            'code_hash',
            'external_subject_hash',
        ],
        'app/Actions/ExternalIdp/LinkExternalSubjectAccountAction.php' => [
            'RecordAuthenticationAuditEventAction',
            'external_idp_account_linked',
            'external_idp_account_link_failed',
            'external_subject_hash',
            'created_user',
            'created_link',
        ],
        'tests/Feature/ExternalIdp/ExternalIdpAuthenticationAuditContractTest.php' => [
            'records external idp redirect callback and account-link authentication audit events without token leakage',
            'records external idp callback and account-link failure authentication audits safely',
            'external_idp_redirect_created',
            'external_idp_callback_exchanged',
            'external_idp_account_linked',
            'external_idp_callback_failed',
            'external_idp_account_link_failed',
            'not->toContain',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue84_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue84 external idp authentication audit tests wired into root ci', function (): void {
    $ci = issue84_file('../../.github/workflows/ci.yml');

    foreach ([
        'ExternalIdpAuthenticationAuditContractTest.php',
        'ExternalIdpAuthenticationAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue84_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
