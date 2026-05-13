<?php

declare(strict_types=1);

namespace App\Services\Session;

use App\Support\Security\SsoSessionCookiePolicy;
use Illuminate\Http\Request;

/**
 * FR-017: Resolves the SSO session ID from the request cookie.
 *
 * Validates that the session ID is a well-formed UUID before returning it,
 * preventing unnecessary database lookups from malformed cookie values.
 */
final class SsoSessionCookieResolver
{
    private const string UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function resolve(Request $request): ?string
    {
        $cookieName = SsoSessionCookiePolicy::configuredName(
            config('sso.session.cookie')
        );

        $sessionId = $request->cookies->get($cookieName);

        if (is_string($sessionId) && $this->isValidSessionId($sessionId)) {
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

            if ($name === $cookieName && is_string($value) && $this->isValidSessionId(urldecode($value))) {
                return urldecode($value);
            }
        }

        return null;
    }

    private function isValidSessionId(string $value): bool
    {
        return $value !== '' && preg_match(self::UUID_PATTERN, $value) === 1;
    }
}
