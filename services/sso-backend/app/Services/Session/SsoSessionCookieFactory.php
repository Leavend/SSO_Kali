<?php

declare(strict_types=1);

namespace App\Services\Session;

use Symfony\Component\HttpFoundation\Cookie;

final class SsoSessionCookieFactory
{
    public function make(string $sessionId): Cookie
    {
        return cookie(
            name: $this->name(),
            value: $sessionId,
            minutes: (int) config('sso.session.ttl_minutes', 480),
            path: '/',
            domain: config('sso.session.cookie_domain'),
            secure: (bool) config('sso.session.cookie_secure', true),
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
            domain: config('sso.session.cookie_domain'),
        );
    }

    public function name(): string
    {
        return (string) config('sso.session.cookie', 'sso_session');
    }
}
