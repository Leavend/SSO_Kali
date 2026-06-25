<?php

declare(strict_types=1);

namespace App\Support\Oidc;

/**
 * RFC 6749 §3.1.2 redirect-URI well-formedness, shared by the runtime exact-match
 * gate (DownstreamClient) and the admin trusted-origin policy
 * (TrustedRedirectUriPolicy) so a hardening fix to one can never silently miss
 * the other.
 *
 * Rejects fragments, double-encoding (`%25`), and path-traversal sequences, and
 * requires an https scheme with a host. Localhost http is permitted only when the
 * caller opts in (development redirect endpoints), never for admin-managed URIs.
 */
final class RedirectUriWellFormedness
{
    /** @var list<string> */
    private const array LOCALHOST_HOSTS = ['localhost', '127.0.0.1', '::1'];

    public static function isWellFormed(string $uri, bool $allowLocalhostHttp = false): bool
    {
        if ($uri === '' || str_contains($uri, '#') || str_contains($uri, '%25')) {
            return false;
        }

        if (str_contains($uri, '/../') || str_contains($uri, '/./') || str_ends_with($uri, '/..')) {
            return false;
        }

        $parsed = parse_url($uri);
        if (! is_array($parsed) || ! isset($parsed['scheme'], $parsed['host'])) {
            return false;
        }

        if ($parsed['scheme'] === 'https') {
            return true;
        }

        return $allowLocalhostHttp
            && $parsed['scheme'] === 'http'
            && in_array($parsed['host'], self::LOCALHOST_HOSTS, true);
    }
}
