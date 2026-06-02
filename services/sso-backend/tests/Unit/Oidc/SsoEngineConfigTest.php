<?php

declare(strict_types=1);

use App\Support\Oidc\SsoEngineConfig;

it('accepts native engine without upstream client configuration', function (): void {
    config()->set('sso.engine', 'native');
    config()->set('sso.upstream_oidc.client_id', '');

    app(SsoEngineConfig::class)->assertStartupConfiguration();

    expect(app(SsoEngineConfig::class)->usesNative())->toBeTrue()
        ->and(app(SsoEngineConfig::class)->usesUpstream())->toBeFalse();
});

it('fails fast when upstream engine has no upstream client id', function (): void {
    config()->set('sso.engine', 'upstream');
    config()->set('sso.upstream_oidc.client_id', '');

    expect(fn () => app(SsoEngineConfig::class)->assertStartupConfiguration())
        ->toThrow(RuntimeException::class, 'SSO_ENGINE=upstream requires sso.upstream_oidc.client_id');
});

it('rejects unknown engine names instead of silently falling back', function (): void {
    config()->set('sso.engine', 'zitadel');

    expect(fn () => app(SsoEngineConfig::class)->assertStartupConfiguration())
        ->toThrow(RuntimeException::class, 'SSO_ENGINE must be either native or upstream.');
});
