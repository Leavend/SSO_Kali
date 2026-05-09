<?php

declare(strict_types=1);

it('locks issue79 login success failure audit contract implementation', function (): void {
    $contracts = [
        'app/Actions/Auth/LoginSsoUserAction.php' => [
            '?string $authRequestId = null',
            '?string $requestId = null',
            'requestId: $requestId',
            'auth_request_id',
            'identifier_hash',
        ],
        'app/Http/Controllers/Auth/LoginController.php' => [
            'X-Request-Id',
            "validated('auth_request_id')",
            'optionalString',
        ],
        'app/Support/Audit/AuthenticationAuditRecord.php' => [
            '?string $requestId = null',
            'loginSucceeded',
            'loginFailed',
        ],
        'tests/Feature/Auth/LoginSuccessFailureAuditContractTest.php' => [
            'records a complete failed login audit contract without sensitive leakage',
            'records a complete successful login audit contract with session correlation',
            'wrong-password-79',
            'not->toContain',
        ],
    ];

    foreach ($contracts as $relativePath => $needles) {
        $content = issue79_file($relativePath);

        expect($content)->toBeString()->not->toBe('');

        foreach ($needles as $needle) {
            expect($content)->toContain($needle);
        }
    }
});

it('keeps issue79 login audit contract tests wired into root ci', function (): void {
    $ci = issue79_file('../../.github/workflows/ci.yml');

    foreach ([
        'LoginSuccessFailureAuditContractTest.php',
        'LoginSuccessFailureAuditContractEvidenceTest.php',
    ] as $testName) {
        expect($ci)->toContain($testName);
    }
});

function issue79_file(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
