<?php

declare(strict_types=1);

use App\Support\Security\SsoSessionCookiePolicy;
use Symfony\Component\HttpFoundation\Cookie;

it('accepts a compliant SSO session cookie policy', function (): void {
    SsoSessionCookiePolicy::assertConfigured('__Host-sso_session', true, '/', null);

    expect(true)->toBeTrue();
});

it('rejects a SSO session cookie policy without a host prefix', function (): void {
    expect(fn (): bool => tap(true, fn () => SsoSessionCookiePolicy::assertConfigured('sso-backend-session', true, '/', null)))
        ->toThrow(RuntimeException::class, 'SSO session cookie must use the __Host- prefix.');
});

it('rejects a SSO session cookie policy with a domain attribute', function (): void {
    expect(fn (): bool => tap(true, fn () => SsoSessionCookiePolicy::assertConfigured('__Host-sso_session', true, '/', 'dev-sso.timeh.my.id')))
        ->toThrow(RuntimeException::class, 'SSO session cookie must omit the Domain attribute.');
});

it('rejects a response cookie without the required attributes', function (): void {
    $cookie = Cookie::create('session', 'value', path: '/auth', domain: 'dev-sso.timeh.my.id', secure: false);

    expect(fn (): bool => tap(true, fn () => SsoSessionCookiePolicy::assertCookie($cookie, '__Host-sso_session')))
        ->toThrow(RuntimeException::class);
});

it('defaults the SSO session cookie name to the canonical host-only name', function (): void {
    expect(SsoSessionCookiePolicy::configuredName(null))->toBe('__Host-sso_session')
        ->and(SsoSessionCookiePolicy::configuredName(''))->toBe('__Host-sso_session');
});
