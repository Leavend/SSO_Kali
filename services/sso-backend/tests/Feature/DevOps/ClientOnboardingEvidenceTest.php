<?php

declare(strict_types=1);

it('keeps the client onboarding guide aligned with OIDC standards and real routes', function (): void {
    $filePath = dirname(base_path(), 2).DIRECTORY_SEPARATOR.'docs/onboarding/client-web-app-onboarding.md';

    expect($filePath)->toBeFile();

    $content = file_get_contents($filePath);

    expect($content)->toBeString()
        ->and($content)->toContain('https://api-sso.timeh.my.id/.well-known/openid-configuration')
        ->and($content)->toContain('public')
        ->and($content)->toContain('confidential')
        ->and($content)->toContain('PKCE')
        ->and($content)->toContain('Go-Live')
        ->and($content)->toContain('/authorize')
        ->and($content)->toContain('/token')
        ->and($content)->toContain('/userinfo')
        ->and($content)->toContain('/jwks')
        ->and($content)->toContain('/revocation')
        ->and($content)->toContain('/connect/logout');
});
