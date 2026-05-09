<?php

declare(strict_types=1);

it('keeps public-domain smoke verification capability named and contract complete', function (): void {
    $script = production_smoke_repository_file('scripts/sso-backend-public-smoke.sh');
    $content = file_get_contents($script);

    expect($script)->toBeFile()
        ->and($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id')
        ->and($content)->toContain('https://sso.timeh.my.id')
        ->and($content)->toContain('/up')
        ->and($content)->toContain('/health')
        ->and($content)->toContain('/ready')
        ->and($content)->toContain('/.well-known/openid-configuration')
        ->and($content)->toContain('/.well-known/jwks.json')
        ->and($content)->toContain('/jwks')
        ->and($content)->toContain('cache-control')
        ->and($content)->toContain('"issuer"')
        ->and($content)->toContain('"jwks_uri"')
        ->and($content)->toContain('Public-domain SSO backend smoke completed successfully');
});

it('documents public-domain production smoke execution for operators', function (): void {
    $runbook = production_smoke_repository_file('docs/devops/sso-backend-production-smoke.md');
    $content = file_get_contents($runbook);

    expect($runbook)->toBeFile()
        ->and($content)->toContain('scripts/sso-backend-public-smoke.sh')
        ->and($content)->toContain('api-sso.timeh.my.id')
        ->and($content)->toContain('sso.timeh.my.id')
        ->and($content)->toContain('No secrets are required')
        ->and($content)->toContain('Evidence to retain');
});

function production_smoke_repository_file(string $path): string
{
    return dirname(base_path(), 2).DIRECTORY_SEPARATOR.$path;
}
