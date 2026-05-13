<?php

declare(strict_types=1);

namespace App\Services\Session;

use App\Support\Security\SsoSessionCookiePolicy;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * FR-017: SSO session cookie factory.
 *
 * Uses SsoSessionCookiePolicy to enforce __Host- prefix, Secure, Path=/,
 * and no Domain attribute — preventing cookie tossing attacks.
 */
final class SsoSessionCookieFactory
{
    public function make(string $sessionId): Cookie
    {
        return cookie(
            name: $this->name(),
            value: $sessionId,
            minutes: (int) config('sso.session.ttl_minutes', 480),
            path: '/',
            domain: null, // Required by __Host- prefix
            secure: true, // Required by __Host- prefix
            httpOnly: true,
            raw: false,
            sameSite: (string) config('sso.session.cookie_same_site', 'lax'),
        );
    }

    public function forget(): Cookie
    {
        return cookie()->forget(
            name: $this->name(),
            path: '/',
            domain: null, // Required by __Host- prefix
        );
    }

    public function name(): string
    {
        return SsoSessionCookiePolicy::configuredName(
            config('sso.session.cookie')
        );
    }
}
