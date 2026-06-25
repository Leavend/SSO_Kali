<?php

declare(strict_types=1);

use App\Services\Oidc\WidgetOriginPolicy;

/**
 * Loopback origins (localhost / 127.0.0.1 / ::1) must never enter the
 * credentialed widget CORS allow-list in production, even when a development
 * default or a misconfigured env leaks one through config('sso.*') or a
 * widget-trusted client's app_base_url. Outside production they stay allowed so
 * local development keeps working.
 */
describe('Widget CORS loopback hardening', function (): void {
    beforeEach(function (): void {
        config()->set('oidc_clients.clients', []);
        config()->set('sso.widget.first_party_origins', []);
        config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
        config()->set('sso.admin_frontend_url', 'http://localhost:8080');
    });

    it('drops a loopback first-party origin in production but keeps the real https origin', function (): void {
        config()->set('app.env', 'production');

        $policy = app(WidgetOriginPolicy::class);
        $policy->flush();

        expect($policy->allowedOrigins())->not->toContain('http://localhost:8080')
            ->and($policy->allowedOrigins())->toContain('https://sso.timeh.my.id')
            ->and($policy->allows('http://localhost:8080'))->toBeFalse()
            ->and($policy->allows('https://sso.timeh.my.id'))->toBeTrue();
    });

    it('keeps loopback first-party origins outside production for local development', function (): void {
        config()->set('app.env', 'local');

        $policy = app(WidgetOriginPolicy::class);
        $policy->flush();

        expect($policy->allows('http://localhost:8080'))->toBeTrue();
    });

    it('drops a loopback app_base_url from a widget-trusted config client in production', function (): void {
        config()->set('app.env', 'production');
        config()->set('oidc_clients.clients', [
            'localhost-client' => [
                'type' => 'public',
                'app_base_url' => 'http://127.0.0.1:9000',
                'widget_cors_trusted' => true,
            ],
        ]);

        $policy = app(WidgetOriginPolicy::class);
        $policy->flush();

        expect($policy->allows('http://127.0.0.1:9000'))->toBeFalse();
    });

    it('drops a loopback IPv6 [::1] origin in production (bracketed host form)', function (): void {
        config()->set('app.env', 'production');
        config()->set('sso.admin_frontend_url', 'http://[::1]:8080');

        $policy = app(WidgetOriginPolicy::class);
        $policy->flush();

        expect($policy->allowedOrigins())->not->toContain('http://[::1]:8080')
            ->and($policy->allows('http://[::1]:8080'))->toBeFalse();
    });
});
