<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class DownstreamClient
{
    /**
     * @param  list<string>  $redirectUris
     * @param  list<string>  $postLogoutRedirectUris
     */
    public function __construct(
        public string $clientId,
        public string $type,
        public array $redirectUris,
        public array $postLogoutRedirectUris,
        public ?string $backchannelLogoutUri = null,
        public ?string $secret = null,
    ) {}

    public function allowsRedirectUri(string $redirectUri): bool
    {
        // RFC 6749 §3.1.2 — reject URIs with fragments or suspicious encoding
        if (! self::isWellFormedRedirectUri($redirectUri)) {
            return false;
        }

        return in_array($redirectUri, $this->redirectUris, true);
    }

    /**
     * RFC 6749 §3.1.2 — The redirection endpoint URI MUST NOT include a fragment component.
     * Additionally guards against double-encoding, path traversal, and non-HTTPS schemes.
     */
    private static function isWellFormedRedirectUri(string $uri): bool
    {
        if ($uri === '' || str_contains($uri, '#')) {
            return false;
        }

        // Block double-encoded characters (%25 encodes %)
        if (str_contains($uri, '%25')) {
            return false;
        }

        // Block path traversal sequences
        if (str_contains($uri, '/../') || str_contains($uri, '/./') || str_ends_with($uri, '/..')) {
            return false;
        }

        $parsed = parse_url($uri);

        if ($parsed === false || ! isset($parsed['scheme'], $parsed['host'])) {
            return false;
        }

        // Only HTTPS in production, allow HTTP for localhost development
        if ($parsed['scheme'] !== 'https') {
            $isLocalhost = in_array($parsed['host'], ['localhost', '127.0.0.1', '::1'], true);

            if (! $isLocalhost || $parsed['scheme'] !== 'http') {
                return false;
            }
        }

        return true;
    }

    public function isPublic(): bool
    {
        return $this->type === 'public';
    }

    public function requiresClientSecret(): bool
    {
        return ! $this->isPublic();
    }
}
