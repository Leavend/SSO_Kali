<?php

declare(strict_types=1);
use App\Http\Middleware\EnforceTelescopeAccess;
use Laravel\Telescope\Http\Middleware\Authorize;

it('pins telescope to the debug subdomain in configuration', function (): void {
    expect(config('telescope.domain'))->toBe('debug.dev-sso.timeh.my.id')
        ->and(config('telescope.allowed_hosts'))->toBe(['debug.dev-sso.timeh.my.id'])
        ->and(config('telescope.middleware'))->toBe([
            EnforceTelescopeAccess::class,
            'web',
            Authorize::class,
        ]);
});
