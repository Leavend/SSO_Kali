<?php

declare(strict_types=1);

it('locks issue83 logout authentication audit contract implementation', function (): void {
    $contracts = [
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            'logoutLifecycle',
        ],
        'app/Actions/Audit/RecordLogoutAuditEventAction.php' => [
            'RecordAuthenticationAuditEventAction',
            'AuthenticationAuditRecord::logoutLifecycle',
            'authenticationAuditRecord',
            'authenticationAuditContext',
            'post_logout_redirect_uri_hash',
            'state_hash',
            'hash(\'sha256\'',
        ],
        'app/Actions/Oidc/PerformFrontChannelLogout.php' => [
            'frontchannel_logout_started',
            'frontchannel_logout_completed',
            'frontchannel_logout_failed',
            "'state' => \$request->query('state')",
        ],
        'app/Actions/Oidc/PerformSingleSignOut.php' => [
            'sso_logout_started',
            'sso_logout_completed',
            'sso_logout_failed',
        ],
        'tests/Feature/Oidc/LogoutAuthenticationAuditContractTest.php' => [
            'records front-channel logout success and failure in the central authentication audit store without protocol leakage',
            'records centralized logout success and invalid-token failure in the central authentication audit store',
            'frontchannel_logout_completed',
            'frontchannel_logout_failed',
            'sso_logout_completed',
            'sso_logout_failed',
            'not->toContain($redirectUri)',
            'not->toContain($state)',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue83_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue83 logout authentication audit tests wired into root ci', function (): void {
    $ci = issue83_file('../../.github/workflows/ci.yml');

    foreach ([
        'LogoutAuthenticationAuditContractTest.php',
        'LogoutAuthenticationAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue83_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
