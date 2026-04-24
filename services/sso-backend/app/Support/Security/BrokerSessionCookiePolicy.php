<?php

declare(strict_types=1);

namespace App\Support\Security;

use RuntimeException;
use Symfony\Component\HttpFoundation\Cookie;

final class BrokerSessionCookiePolicy
{
    public const string DEFAULT_NAME = '__Host-broker_session';

    public static function configuredName(?string $configured): string
    {
        $name = trim((string) $configured);

        return $name === '' ? self::DEFAULT_NAME : $name;
    }

    public static function assertConfigured(string $name, bool $secure, string $path, mixed $domain): void
    {
        self::assertHostPrefix($name);
        self::assertSecure($secure);
        self::assertPath($path);
        self::assertNoDomain($domain);
    }

    public static function assertCookie(Cookie $cookie, string $expectedName): void
    {
        self::assertCookieName($cookie, $expectedName);
        self::assertSecure($cookie->isSecure());
        self::assertPath($cookie->getPath());
        self::assertNoDomain($cookie->getDomain());
    }

    private static function assertCookieName(Cookie $cookie, string $expectedName): void
    {
        if ($cookie->getName() !== $expectedName) {
            throw new RuntimeException('Broker session cookie name is invalid.');
        }

        self::assertHostPrefix($expectedName);
    }

    private static function assertHostPrefix(string $name): void
    {
        if (! str_starts_with($name, '__Host-')) {
            throw new RuntimeException('Broker session cookie must use the __Host- prefix.');
        }
    }

    private static function assertSecure(bool $secure): void
    {
        if (! $secure) {
            throw new RuntimeException('Broker session cookie must be Secure.');
        }
    }

    private static function assertPath(string $path): void
    {
        if ($path !== '/') {
            throw new RuntimeException('Broker session cookie must use Path=/.');
        }
    }

    private static function assertNoDomain(mixed $domain): void
    {
        if (is_string($domain) && trim($domain) !== '') {
            throw new RuntimeException('Broker session cookie must omit the Domain attribute.');
        }

        if (! is_string($domain) && $domain !== null) {
            throw new RuntimeException('Broker session cookie must omit the Domain attribute.');
        }
    }
}
