<?php

declare(strict_types=1);

it('keeps externalIdp production smoke secret-free and readiness complete', function (): void {
    $script = externalIdp_production_smoke_repository_file('scripts/sso-backend-external-idp-production-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('/ready')
        ->and($content)->toContain('external_idps')
        ->and($content)->toContain('/.well-known/openid-configuration')
        ->and($content)->toContain('/.well-known/jwks.json')
        ->and($content)->toContain('/jwks')
        ->and($content)->toContain('/admin/external-idps')
        ->and($content)->toContain('--require-configured-provider')
        ->and($content)->toContain('External IdP production smoke completed successfully without secrets or tokens')
        ->and($content)->not->toContain('client_secret=')
        ->and($content)->not->toContain('Authorization: Bearer')
        ->and($content)->not->toMatch('/refresh_token\s*=\s*[A-Za-z0-9_.\-]+/');
});

it('documents externalIdp production smoke execution and evidence requirements', function (): void {
    $runbook = externalIdp_production_smoke_repository_file('docs/devops/sso-backend-external-idp-production-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-external-idp-production-smoke.sh')
        ->and($content)->toContain('external_idps')
        ->and($content)->toContain('RUN_FR005_PRODUCTION_SMOKE=true')
        ->and($content)->toContain('--require-configured-provider')
        ->and($content)->toContain('Evidence to Retain')
        ->and($content)->toContain('without secrets or tokens')
        ->and($content)->not->toContain('client_secret=');
});

it('wires externalIdp production smoke after deploy behind an explicit github actions gate', function (): void {
    $workflow = externalIdp_production_smoke_repository_file('.github/workflows/deploy-main.yml');
    $content = file_get_contents($workflow);

    expect($content)->toContain('Run External IdP production smoke')
        ->and($content)->toContain('RUN_FR005_PRODUCTION_SMOKE')
        ->and($content)->toContain('scripts/sso-backend-external-idp-production-smoke.sh')
        ->and($content)->toContain('https://api-sso.timeh.my.id');
});

function externalIdp_production_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
