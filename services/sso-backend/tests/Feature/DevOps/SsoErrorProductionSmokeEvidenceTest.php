<?php

declare(strict_types=1);

it('keeps FR-007 production smoke secret-free and boundary complete', function (): void {
    $script = fr007_sso_error_smoke_repository_file('scripts/sso-backend-sso-error-production-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('/up')
        ->and($content)->toContain('/health')
        ->and($content)->toContain('/ready')
        ->and($content)->toContain('/authorize')
        ->and($content)->toContain('/token')
        ->and($content)->toContain('/admin/api/sso-error-templates')
        ->and($content)->toContain('prompt=none login_required keeps OIDC client redirect while recording error_ref')
        ->and($content)->toContain('token invalid_grant keeps OAuth JSON error contract')
        ->and($content)->toContain('admin SSO error templates API requires auth')
        ->and($content)->toContain('assert_no_secret_like_output')
        ->and($content)->toContain('FR-007 SSO error production smoke completed successfully without secrets or tokens')
        ->and($content)->not->toContain('client_secret=')
        ->and($content)->not->toContain('Authorization: Bearer')
        ->and($content)->not->toMatch('/refresh_token\s*=\s*[A-Za-z0-9_.\-]+/');
});

it('documents FR-007 production smoke execution and evidence requirements', function (): void {
    $runbook = fr007_sso_error_smoke_repository_file('docs/devops/sso-backend-sso-error-production-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-sso-error-production-smoke.sh')
        ->and($content)->toContain('RUN_FR007_PRODUCTION_SMOKE=true')
        ->and($content)->toContain('OIDC prompt=none client redirect contract')
        ->and($content)->toContain('Token endpoint OAuth/OIDC JSON error contract')
        ->and($content)->toContain('Admin SSO error template authentication boundary')
        ->and($content)->toContain('Evidence to Retain')
        ->and($content)->toContain('without secrets or tokens')
        ->and($content)->not->toContain('client_secret=');
});

it('wires FR-007 production smoke after deploy behind an explicit github actions gate', function (): void {
    $workflow = fr007_sso_error_smoke_repository_file('.github/workflows/deploy-main.yml');
    $content = file_get_contents($workflow);

    expect($content)->toContain('Run FR-007 SSO error production smoke')
        ->and($content)->toContain('RUN_FR007_PRODUCTION_SMOKE')
        ->and($content)->toContain('scripts/sso-backend-sso-error-production-smoke.sh')
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('https://sso.timeh.my.id/app-a/auth/callback');
});

function fr007_sso_error_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
