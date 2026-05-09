<?php

declare(strict_types=1);

it('documents oauth load-test client without committing secrets', function (): void {
    $runbook = oauth_load_test_repository_file('docs/devops/sso-backend-oauth-load-test.md');
    $registry = base_path('config/oidc_clients.php');

    expect($runbook)->toBeFile()
        ->and($registry)->toBeFile();

    $content = file_get_contents($runbook);
    $registryContent = file_get_contents($registry);

    expect($content)->toBeString()
        ->and($content)->toContain('client_credentials')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET_HASH')
        ->and($content)->not->toMatch('/client_secret\s*=\s*[A-Za-z0-9_\-]{16,}/')
        ->and($registryContent)->toContain('SSO_LOAD_TEST_CLIENT_ENABLED')
        ->and($registryContent)->toContain('SSO_LOAD_TEST_CLIENT_SECRET_HASH')
        ->and($registryContent)->not->toContain('SSO_LOAD_TEST_CLIENT_SECRET\'');
});

function oauth_load_test_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
