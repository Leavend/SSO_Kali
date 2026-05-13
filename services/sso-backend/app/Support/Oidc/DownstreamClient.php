<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use Illuminate\Support\Carbon;

final readonly class DownstreamClient
{
    /**
     * @param  list<string>  $redirectUris
     * @param  list<string>  $postLogoutRedirectUris
     * @param  list<string>  $allowedScopes
     */
    public function __construct(
        public string $clientId,
        public string $type,
        public array $redirectUris,
        public array $postLogoutRedirectUris,
        public array $allowedScopes,
        public ?string $backchannelLogoutUri = null,
        public ?string $secret = null,
        public ?Carbon $secretExpiresAt = null,
        public ?Carbon $secretRotatedAt = null,
        public bool $skipConsent = true,
    ) {}

    /**
     * FR-009: Whether the client secret has passed its expiry date.
     * Returns false if no expiry is set (config-based clients without TTL).
     */
    public function isSecretExpired(): bool
    {
        return $this->secretExpiresAt !== null && $this->secretExpiresAt->isPast();
    }

    public function allowsRedirectUri(string $redirectUri): bool
    {
        // RFC 6749 §3.1.2 — reject URIs with fragments or suspicious encoding
        if (! self::isWellFormedRedirectUri($redirectUri)) {
            return false;
        }

        // FR-008: OAuth 2.1 BCP §4.1.1 mandates byte-for-byte exact match
        // for redirect URIs. The `true` flag on in_array (strict comparison)
        // is deliberate — do NOT loosen this to case-insensitive or prefix
        // matching. Unit tests in tests/Unit/Oidc/RedirectUriExactMatchTest
        // guard every attack vector observed on production.
        return in_array($redirectUri, $this->redirectUris, true);
    }

    public function allowsPostLogoutRedirectUri(string $redirectUri): bool
    {
        if (! self::isWellFormedRedirectUri($redirectUri)) {
            return false;
        }

        return in_array($redirectUri, $this->postLogoutRedirectUris, true);
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

    /**
     * FR-010: Whether the backchannel logout URI is well-formed.
     * Returns true if no URI is configured (public clients, or clients without backchannel).
     */
    public function hasValidBackchannelLogoutUri(): bool
    {
        if ($this->backchannelLogoutUri === null || $this->backchannelLogoutUri === '') {
            return true;
        }

        return self::isWellFormedRedirectUri($this->backchannelLogoutUri);
    }
}
