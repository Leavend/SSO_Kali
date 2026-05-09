<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Support\Jwt\JwtHeader;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

final class ExternalIdpTokenExchangeService
{
    public function __construct(
        private readonly ExternalIdpAuthenticationRedirectService $states,
        private readonly ExternalIdpDiscoveryService $discovery,
        private readonly ExternalIdpJwksService $jwks,
    ) {}

    /**
     * @return array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}
     */
    public function exchange(ExternalIdentityProvider $provider, string $state, string $code): array
    {
        $context = $this->states->pull($state);

        if ($context === null) {
            throw new RuntimeException('External IdP authentication state is invalid or expired.');
        }

        if (($context['provider_key'] ?? null) !== $provider->provider_key) {
            throw new RuntimeException('External IdP authentication state provider mismatch.');
        }

        $metadata = $this->discovery->discovery($provider);
        $tokenEndpoint = $this->tokenEndpoint($metadata);
        $tokens = $this->exchangeCode($provider, $tokenEndpoint, $code, $context);
        $claims = $this->validateIdToken($provider, (string) $tokens['id_token'], $context);

        return [
            'provider_key' => $provider->provider_key,
            'subject' => $this->requiredString($claims, 'sub', 'External IdP subject claim is missing.'),
            'email' => $this->optionalString($claims, 'email'),
            'name' => $this->optionalString($claims, 'name'),
            'return_to' => $this->optionalString($context, 'return_to'),
            'claims' => $this->publicClaims($claims),
        ];
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function tokenEndpoint(array $metadata): string
    {
        $endpoint = $metadata['token_endpoint'] ?? null;

        if (! is_string($endpoint) || ! str_starts_with($endpoint, 'https://')) {
            throw new RuntimeException('External IdP token endpoint must use HTTPS.');
        }

        return $endpoint;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function exchangeCode(
        ExternalIdentityProvider $provider,
        string $tokenEndpoint,
        string $code,
        array $context,
    ): array {
        $response = Http::asForm()
            ->acceptJson()
            ->timeout($this->timeoutSeconds())
            ->post($tokenEndpoint, array_filter([
                'grant_type' => 'authorization_code',
                'client_id' => $provider->client_id,
                'client_secret' => $this->clientSecret($provider),
                'code' => $code,
                'redirect_uri' => $this->requiredString($context, 'redirect_uri', 'External IdP redirect URI state is missing.'),
                'code_verifier' => $this->requiredString($context, 'code_verifier', 'External IdP PKCE verifier state is missing.'),
            ], static fn (?string $value): bool => $value !== null))
            ->throw()
            ->json();

        if (! is_array($response) || ! is_string($response['id_token'] ?? null) || $response['id_token'] === '') {
            throw new RuntimeException('External IdP token response is missing id_token.');
        }

        return $response;
    }

    private function clientSecret(ExternalIdentityProvider $provider): ?string
    {
        if ($provider->client_secret_encrypted === null) {
            return null;
        }

        return Crypt::decryptString($provider->client_secret_encrypted);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function validateIdToken(ExternalIdentityProvider $provider, string $idToken, array $context): array
    {
        $algorithm = JwtHeader::algorithm($idToken);

        if ($algorithm === 'none' || ! in_array($algorithm, $provider->allowed_algorithms, true)) {
            throw new RuntimeException('External IdP id_token algorithm is not allowed.');
        }

        $kid = JwtHeader::keyId($idToken);

        if ($kid === null) {
            throw new RuntimeException('External IdP id_token kid is missing.');
        }

        try {
            $jwks = $this->jwks->document($provider, $kid);
            $decoded = JWT::decode($idToken, JWK::parseKeySet($jwks));
        } catch (Throwable $exception) {
            throw new RuntimeException('External IdP id_token signature validation failed.', 0, $exception);
        }

        $claims = json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($claims)) {
            throw new RuntimeException('External IdP id_token claims are invalid.');
        }

        $this->assertClaim($claims, 'iss', $provider->issuer, 'External IdP issuer claim mismatch.');
        $this->assertClaim($claims, 'aud', $provider->client_id, 'External IdP audience claim mismatch.');
        $this->assertClaim($claims, 'nonce', $this->requiredString($context, 'nonce', 'External IdP nonce state is missing.'), 'External IdP nonce claim mismatch.');
        $this->requiredString($claims, 'sub', 'External IdP subject claim is missing.');

        return $claims;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertClaim(array $claims, string $key, string $expected, string $message): void
    {
        $actual = $claims[$key] ?? null;

        if (is_array($actual)) {
            if (! in_array($expected, $actual, true)) {
                throw new RuntimeException($message);
            }

            return;
        }

        if ($actual !== $expected) {
            throw new RuntimeException($message);
        }
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function requiredString(array $values, string $key, string $message): string
    {
        $value = $values[$key] ?? null;

        if (! is_string($value) || $value === '') {
            throw new RuntimeException($message);
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function optionalString(array $values, string $key): ?string
    {
        $value = $values[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function publicClaims(array $claims): array
    {
        return array_intersect_key($claims, array_flip([
            'iss',
            'sub',
            'aud',
            'exp',
            'iat',
            'nonce',
            'email',
            'email_verified',
            'name',
            'preferred_username',
        ]));
    }

    private function timeoutSeconds(): int
    {
        return max(1, (int) config('sso.external_idp.token_timeout_seconds', 5));
    }
}
