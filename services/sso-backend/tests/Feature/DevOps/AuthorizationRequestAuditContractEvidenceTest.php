<?php

declare(strict_types=1);

it('locks issue80 authorization request audit contract implementation', function (): void {
    $contracts = [
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'authorizationRequestAccepted',
            'authorizationRequestRejected',
            'authorization_request_accepted',
            'authorization_request_rejected',
        ],
        'app/Actions/Oidc/CreateAuthorizationRedirect.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::authorizationRequestAccepted',
            'AuthenticationAuditRecord::authorizationRequestRejected',
            'recordAccepted',
            'recordRejected',
            'auditContext',
            'redirect_uri_hash',
            'state_hash',
            'nonce_hash',
        ],
        'tests/Feature/Oidc/AuthorizationRequestAuditContractTest.php' => [
            'records accepted authorization requests without leaking state nonce or redirect uri',
            'records rejected authorization requests with safe protocol context',
            'not->toContain($state)',
            'not->toContain($nonce)',
            'not->toContain($redirectUri)',
            'not->toContain($challenge)',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue80_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue80 authorization request audit tests wired into root ci', function (): void {
    $ci = issue80_file('../../.github/workflows/ci.yml');

    foreach ([
        'AuthorizationRequestAuditContractTest.php',
        'AuthorizationRequestAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue80_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
