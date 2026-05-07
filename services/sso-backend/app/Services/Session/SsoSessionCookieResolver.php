<?php

declare(strict_types=1);

namespace App\Services\Session;

use Illuminate\Http\Request;

final class SsoSessionCookieResolver
{
    public function resolve(Request $request): ?string
    {
        $cookieName = (string) config('sso.session.cookie', 'sso_session');
        $sessionId = $request->cookies->get($cookieName);

        if (is_string($sessionId) && $sessionId !== '') {
            return $sessionId;
        }

        return $this->fromHeader($request, $cookieName);
    }

    private function fromHeader(Request $request, string $cookieName): ?string
    {
        $cookieHeader = $request->headers->get('Cookie');

        if (! is_string($cookieHeader) || $cookieHeader === '') {
            return null;
        }

        foreach (explode(';', $cookieHeader) as $cookie) {
            [$name, $value] = array_pad(explode('=', trim($cookie), 2), 2, null);

            if ($name === $cookieName && is_string($value) && $value !== '') {
                return urldecode($value);
            }
        }

        return null;
    }
}
