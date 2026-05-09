<?php

declare(strict_types=1);

it('keeps fr004 production smoke secret-free and protocol complete', function (): void {
    $script = fr004_production_smoke_repository_file('scripts/sso-backend-fr004-production-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('/.well-known/openid-configuration')
        ->and($content)->toContain('/.well-known/jwks.json')
        ->and($content)->toContain('/token')
        ->and($content)->toContain('/revocation')
        ->and($content)->toContain('/userinfo')
        ->and($content)->toContain('prompt=none')
        ->and($content)->toContain('error=login_required')
        ->and($content)->toContain('prompt=unsupported')
        ->and($content)->toContain('error=invalid_request')
        ->and($content)->toContain('FR-004 production smoke completed successfully without secrets or tokens')
        ->and($content)->not->toContain('client_secret=')
        ->and($content)->not->toContain('Authorization: Bearer')
        ->and($content)->not->toMatch('/refresh_token\s*=\s*[A-Za-z0-9_.\-]+/');
});

it('documents fr004 production smoke execution and evidence requirements', function (): void {
    $runbook = fr004_production_smoke_repository_file('docs/devops/sso-backend-fr004-production-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-fr004-production-smoke.sh')
        ->and($content)->toContain('OIDC discovery metadata')
        ->and($content)->toContain('prompt=none non-interactive failure semantics')
        ->and($content)->toContain('invalid prompt rejection')
        ->and($content)->toContain('RUN_FR004_PRODUCTION_SMOKE=true')
        ->and($content)->toContain('Evidence to Retain')
        ->and($content)->toContain('no secrets or tokens were used')
        ->and($content)->not->toContain('client_secret=');
});

it('wires fr004 production smoke after deploy behind an explicit github actions gate', function (): void {
    $workflow = fr004_production_smoke_repository_file('.github/workflows/deploy-main.yml');
    $content = file_get_contents($workflow);

    expect($content)->toContain('Run FR-004 production smoke')
        ->and($content)->toContain('RUN_FR004_PRODUCTION_SMOKE')
        ->and($content)->toContain('scripts/sso-backend-fr004-production-smoke.sh')
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('https://sso.timeh.my.id/auth/callback');
});

function fr004_production_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
