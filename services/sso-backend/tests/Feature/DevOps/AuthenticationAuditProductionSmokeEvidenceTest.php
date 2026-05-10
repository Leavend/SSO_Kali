<?php

declare(strict_types=1);

it('keeps authentication audit production smoke secret-free and boundary complete', function (): void {
    $script = authenticationAudit_production_smoke_repository_file('scripts/sso-backend-authentication-audit-production-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('/up')
        ->and($content)->toContain('/health')
        ->and($content)->toContain('/ready')
        ->and($content)->toContain('/.well-known/openid-configuration')
        ->and($content)->toContain('/.well-known/jwks.json')
        ->and($content)->toContain('/admin/api/audit/authentication-events')
        ->and($content)->toContain('admin authentication audit API requires auth')
        ->and($content)->toContain('admin authentication audit detail API requires auth')
        ->and($content)->toContain('assert_no_secret_like_output')
        ->and($content)->toContain('Authentication Audit production smoke completed successfully without secrets or tokens')
        ->and($content)->not->toContain('client_secret=')
        ->and($content)->not->toContain('Authorization: Bearer')
        ->and($content)->not->toMatch('/refresh_token\s*=\s*[A-Za-z0-9_.\-]+/');
});

it('documents authentication audit production smoke execution and evidence requirements', function (): void {
    $runbook = authenticationAudit_production_smoke_repository_file('docs/devops/sso-backend-authentication-audit-production-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-authentication-audit-production-smoke.sh')
        ->and($content)->toContain('RUN_FR006_PRODUCTION_SMOKE=true')
        ->and($content)->toContain('Admin Authentication Audit API authentication boundary')
        ->and($content)->toContain('Evidence to Retain')
        ->and($content)->toContain('without secrets or tokens')
        ->and($content)->toContain('critical RBAC/auth boundary regression')
        ->and($content)->not->toContain('client_secret=');
});

it('wires authentication audit production smoke after deploy behind an explicit github actions gate', function (): void {
    $workflow = authenticationAudit_production_smoke_repository_file('.github/workflows/deploy-main.yml');
    $content = file_get_contents($workflow);

    expect($content)->toContain('Run Authentication Audit production smoke')
        ->and($content)->toContain('RUN_FR006_PRODUCTION_SMOKE')
        ->and($content)->toContain('scripts/sso-backend-authentication-audit-production-smoke.sh')
        ->and($content)->toContain('https://api-sso.timeh.my.id');
});

function authenticationAudit_production_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
