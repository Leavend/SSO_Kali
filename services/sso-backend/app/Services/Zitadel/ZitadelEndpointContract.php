<?php

declare(strict_types=1);

namespace App\Services\Zitadel;

use RuntimeException;

final class ZitadelEndpointContract
{
    /**
     * @return array<string, string>
     */
    public function supportedPaths(): array
    {
        return [
            'authorization_endpoint' => '/oauth/v2/authorize',
            'token_endpoint' => '/oauth/v2/token',
            'userinfo_endpoint' => '/oidc/v1/userinfo',
            'jwks_uri' => '/oauth/v2/keys',
            'revocation_endpoint' => '/oauth/v2/revoke',
            'end_session_endpoint' => '/oidc/v1/end_session',
        ];
    }

    public function url(string $issuer, string $endpoint): string
    {
        return rtrim($issuer, '/').$this->path($endpoint);
    }

    public function supports(string $endpoint): bool
    {
        return array_key_exists($endpoint, $this->supportedPaths());
    }

    private function path(string $endpoint): string
    {
        $path = $this->supportedPaths()[$endpoint] ?? null;

        if ($path === null) {
            throw new RuntimeException("Unsupported ZITADEL endpoint contract [{$endpoint}].");
        }

        return $path;
    }
}
