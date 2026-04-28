<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final class ClientUrlOrigin
{
    /**
     * @return array{fragment?: string, host?: string, pass?: string, path?: string, port?: int, query?: string, scheme?: string, user?: string}|null
     */
    public static function parse(string $input): ?array
    {
        $parts = parse_url($input);

        return is_array($parts) && isset($parts['scheme'], $parts['host']) ? $parts : null;
    }

    public static function fromInput(string $input): string
    {
        $url = self::parse($input);

        return $url === null ? rtrim($input, '/') : self::fromParts($url);
    }

    /**
     * @param  array{host?: string, port?: int, scheme?: string}  $url
     */
    public static function fromParts(array $url): string
    {
        $scheme = strtolower((string) $url['scheme']);
        $host = self::hostLiteral((string) $url['host']);

        return "{$scheme}://{$host}".self::portSuffix($scheme, $url['port'] ?? null);
    }

    /**
     * @param  array{scheme?: string}  $url
     */
    public static function isHttps(array $url): bool
    {
        return strtolower((string) ($url['scheme'] ?? '')) === 'https';
    }

    /**
     * @param  array{host?: string}  $url
     */
    public static function isLocalhost(array $url): bool
    {
        return in_array(strtolower((string) ($url['host'] ?? '')), ['localhost', '127.0.0.1', '::1'], true);
    }

    private static function hostLiteral(string $host): string
    {
        $normalized = strtolower($host);

        return str_contains($normalized, ':') && ! str_starts_with($normalized, '[')
            ? "[{$normalized}]"
            : $normalized;
    }

    private static function portSuffix(string $scheme, mixed $port): string
    {
        if (! is_int($port) || ($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) {
            return '';
        }

        return ":{$port}";
    }
}
