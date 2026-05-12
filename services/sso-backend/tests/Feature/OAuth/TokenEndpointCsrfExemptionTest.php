<?php

declare(strict_types=1);

namespace Tests\Feature\OAuth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FR-007 / UC-22 / UC-30 contract: the OAuth token + revocation endpoints
 * MUST be exempt from Laravel's CSRF token check. Client authentication at
 * these endpoints is governed by RFC 6749 §2.3 (client_secret) or PKCE for
 * public clients — never by a browser CSRF cookie.
 *
 * A stale exemption list in bootstrap/app.php previously allowed only the
 * (non-existent) 'oauth2/token' path, causing every real token exchange to
 * return HTTP 419 "Page Expired". This test guards that fix.
 */
final class TokenEndpointCsrfExemptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_oauth_token_is_not_rejected_with_csrf_419(): void
    {
        $response = $this->post('/oauth/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'unknown-client',
            'code' => 'fake',
            'redirect_uri' => 'https://example.test/auth/callback',
            'code_verifier' => 'fake',
        ]);

        self::assertNotSame(
            419,
            $response->getStatusCode(),
            '/oauth/token must be CSRF-exempt. Got 419 = the CSRF middleware is still intercepting it.',
        );
    }

    public function test_oauth_revoke_is_not_rejected_with_csrf_419(): void
    {
        $response = $this->post('/oauth/revoke', [
            'token' => 'fake',
            'client_id' => 'unknown-client',
        ]);

        self::assertNotSame(
            419,
            $response->getStatusCode(),
            '/oauth/revoke must be CSRF-exempt.',
        );
    }
}
