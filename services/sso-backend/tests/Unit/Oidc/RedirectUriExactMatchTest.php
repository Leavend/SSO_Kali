<?php

declare(strict_types=1);

namespace Tests\Unit\Oidc;

use App\Support\Oidc\DownstreamClient;
use Tests\TestCase;

/**
 * FR-008 contract: redirect URI validation MUST be an exact string match
 * after well-formedness guards, per OAuth 2.1 §3.1.2 + Best Current Practice
 * §4.1.1. No normalization, no prefix matching, no wildcard matching.
 *
 * This test documents every attack vector we have seen in the wild and
 * asserts that each one is rejected. A future refactor that accidentally
 * loosens the check (e.g. switching to prefix match or dropping the strict
 * flag on in_array) will break these tests.
 */
final class RedirectUriExactMatchTest extends TestCase
{
    private const REGISTERED = 'https://sso.timeh.my.id/auth/callback';

    private function client(): DownstreamClient
    {
        return new DownstreamClient(
            clientId: 'sso-frontend-portal',
            type: 'public',
            redirectUris: [self::REGISTERED],
            postLogoutRedirectUris: ['https://sso.timeh.my.id/'],
            allowedScopes: ['openid', 'profile', 'email'],
        );
    }

    public function test_accepts_exact_registered_uri(): void
    {
        self::assertTrue($this->client()->allowsRedirectUri(self::REGISTERED));
    }

    public function test_rejects_trailing_slash_variant(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri(self::REGISTERED.'/'));
    }

    public function test_rejects_appended_query_string(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri(self::REGISTERED.'?foo=bar'));
    }

    public function test_rejects_appended_fragment(): void
    {
        // RFC 6749 §3.1.2 — fragment MUST NOT be present.
        self::assertFalse($this->client()->allowsRedirectUri(self::REGISTERED.'#token'));
    }

    public function test_rejects_scheme_case_variant(): void
    {
        // OAuth 2.1 BCP §4.1.1: byte-for-byte exact match for redirect URIs.
        self::assertFalse($this->client()->allowsRedirectUri('HTTPS://sso.timeh.my.id/auth/callback'));
    }

    public function test_rejects_host_case_variant(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.TIMEH.my.id/auth/callback'));
    }

    public function test_rejects_default_port_reinjection(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.timeh.my.id:443/auth/callback'));
    }

    public function test_rejects_different_host(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('https://evil.example.com/auth/callback'));
    }

    public function test_rejects_plaintext_http_downgrade(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('http://sso.timeh.my.id/auth/callback'));
    }

    public function test_rejects_path_traversal(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.timeh.my.id/auth/../callback'));
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.timeh.my.id/auth/./callback'));
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.timeh.my.id/auth/callback/..'));
    }

    public function test_rejects_double_encoded_percent(): void
    {
        // %25 is the encoded form of '%' — blocks encoding bypass attacks.
        self::assertFalse($this->client()->allowsRedirectUri('https://sso.timeh.my.id/auth/callback%25'));
    }

    public function test_rejects_empty_string(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri(''));
    }

    public function test_rejects_unparseable_input(): void
    {
        self::assertFalse($this->client()->allowsRedirectUri('not-a-url'));
        self::assertFalse($this->client()->allowsRedirectUri('://missing-scheme'));
    }

    public function test_allows_http_localhost_for_development(): void
    {
        $dev = new DownstreamClient(
            clientId: 'app-a-dev',
            type: 'public',
            redirectUris: ['http://localhost:3000/auth/callback'],
            postLogoutRedirectUris: [],
            allowedScopes: ['openid'],
        );

        self::assertTrue($dev->allowsRedirectUri('http://localhost:3000/auth/callback'));
        self::assertFalse($dev->allowsRedirectUri('http://localhost:3000/auth/callback/'));
    }
}
