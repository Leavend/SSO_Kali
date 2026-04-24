<?php

declare(strict_types=1);

use App\Support\Security\BrokerSessionCookiePolicy;
use Symfony\Component\HttpFoundation\Cookie;

it('accepts a compliant broker session cookie policy', function (): void {
    BrokerSessionCookiePolicy::assertConfigured('__Host-broker_session', true, '/', null);

    expect(true)->toBeTrue();
});

it('rejects a broker session cookie policy without a host prefix', function (): void {
    expect(fn (): bool => tap(true, fn () => BrokerSessionCookiePolicy::assertConfigured('sso-backend-session', true, '/', null)))
        ->toThrow(RuntimeException::class, 'Broker session cookie must use the __Host- prefix.');
});

it('rejects a broker session cookie policy with a domain attribute', function (): void {
    expect(fn (): bool => tap(true, fn () => BrokerSessionCookiePolicy::assertConfigured('__Host-broker_session', true, '/', 'dev-sso.timeh.my.id')))
        ->toThrow(RuntimeException::class, 'Broker session cookie must omit the Domain attribute.');
});

it('rejects a response cookie without the required attributes', function (): void {
    $cookie = Cookie::create('session', 'value', path: '/auth', domain: 'dev-sso.timeh.my.id', secure: false);

    expect(fn (): bool => tap(true, fn () => BrokerSessionCookiePolicy::assertCookie($cookie, '__Host-broker_session')))
        ->toThrow(RuntimeException::class);
});

it('defaults the broker session cookie name to the canonical host-only name', function (): void {
    expect(BrokerSessionCookiePolicy::configuredName(null))->toBe('__Host-broker_session')
        ->and(BrokerSessionCookiePolicy::configuredName(''))->toBe('__Host-broker_session');
});
