<?php

declare(strict_types=1);

namespace Tests\Feature\Oidc;

use Tests\TestCase;

/**
 * FR-007: Discovery `token_endpoint_auth_methods_supported` must advertise
 * every authentication method the server actually accepts at /oauth/token.
 *
 * This SSO issues:
 *   - `client_secret_basic` — confidential clients (RFC 6749 §2.3.1)
 *   - `client_secret_post`  — confidential clients (alt)
 *   - `none`                — public clients with PKCE (RFC 8414 §2)
 *
 * Per RFC 8414 §2, the server SHOULD publish all supported values so
 * conformant RP libraries can pick the right one.
 */
final class DiscoveryAuthMethodContractTest extends TestCase
{
    public function test_discovery_advertises_all_supported_auth_methods(): void
    {
        $response = $this->getJson('/.well-known/openid-configuration');

        $response->assertOk();
        $methods = $response->json('token_endpoint_auth_methods_supported');

        self::assertIsArray($methods);
        self::assertContains('client_secret_basic', $methods);
        self::assertContains('client_secret_post', $methods);
        self::assertContains(
            'none',
            $methods,
            'Public PKCE clients (e.g. SPA portal) authenticate with "none" — Discovery must advertise it per RFC 8414 §2.',
        );
    }
}
