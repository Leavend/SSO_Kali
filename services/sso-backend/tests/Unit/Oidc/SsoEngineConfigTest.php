<?php

declare(strict_types=1);

use App\Support\Oidc\SsoEngineConfig;

it('accepts native engine as the only supported runtime', function (): void {
    config()->set('sso.engine', 'native');

    app(SsoEngineConfig::class)->assertStartupConfiguration();

    expect(app(SsoEngineConfig::class)->usesNative())->toBeTrue();
});

it('rejects upstream engine because the broker path has been removed', function (): void {
    config()->set('sso.engine', 'upstream');

    expect(fn () => app(SsoEngineConfig::class)->assertStartupConfiguration())
        ->toThrow(RuntimeException::class, 'SSO_ENGINE must be native. Upstream OIDC broker mode has been removed.');
});

it('rejects unknown engine names instead of silently falling back', function (): void {
    config()->set('sso.engine', 'zitadel');

    expect(fn () => app(SsoEngineConfig::class)->assertStartupConfiguration())
        ->toThrow(RuntimeException::class, 'SSO_ENGINE must be native. Upstream OIDC broker mode has been removed.');
});
