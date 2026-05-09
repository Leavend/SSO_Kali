<?php

declare(strict_types=1);

it('keeps production oauth token-flow smoke secret-safe and dedicated to load-test client', function (): void {
    $script = oauth_token_smoke_repository_file('scripts/sso-backend-oauth-token-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET')
        ->and($content)->toContain('sso-load-test-client')
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('/oauth/token')
        ->and($content)->toContain('grant_type=client_credentials')
        ->and($content)->toContain('access_token missing')
        ->and($content)->toContain('token_type must be Bearer')
        ->and($content)->toContain('client_credentials must not issue refresh_token')
        ->and($content)->toContain('invalid client secret rejected as expected')
        ->and($content)->toContain('without printing secrets or tokens')
        ->and($content)->not->toMatch('/client_secret\s*=\s*[A-Za-z0-9_\-]{16,}/')
        ->and($content)->not->toContain('SSO_LOAD_TEST_CLIENT_SECRET=<');
});

it('documents production oauth token-flow smoke execution without committing plaintext secrets', function (): void {
    $runbook = oauth_token_smoke_repository_file('docs/devops/sso-backend-oauth-token-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-oauth-token-smoke.sh')
        ->and($content)->toContain('No secrets are committed to git')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET_HASH')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_SECRET')
        ->and($content)->toContain('refresh_token absent')
        ->and($content)->toContain('invalid_client')
        ->and($content)->toContain('Evidence to Retain')
        ->and($content)->toContain('SSO_LOAD_TEST_CLIENT_ENABLED=false')
        ->and($content)->not->toMatch('/client_secret\s*=\s*[A-Za-z0-9_\-]{16,}/');
});

function oauth_token_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
