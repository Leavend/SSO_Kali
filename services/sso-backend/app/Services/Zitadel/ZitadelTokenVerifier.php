<?php

declare(strict_types=1);

namespace App\Services\Zitadel;

use App\Services\Oidc\JwtRejectMetrics;
use App\Support\Jwt\JwtHeader;
use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use RuntimeException;
use Throwable;

final class ZitadelTokenVerifier
{
    public function __construct(
        private readonly ZitadelMetadataService $metadata,
        private readonly ZitadelJwksCache $jwks,
        private readonly JwtRejectMetrics $metrics,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function verifyIdToken(string $token, string $expectedNonce): array
    {
        $this->assertAllowedAlgorithm($token);
        $claims = $this->decode($token);
        $this->assertIssuer($claims);
        $this->assertAudience($claims);
        $this->assertExpiry($claims);
        $this->assertIssuedAt($claims);
        $this->assertNonce($claims, $expectedNonce);

        return $claims;
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(string $token): array
    {
        try {
            $decoded = JWT::decode($token, JWK::parseKeySet($this->jwksFor($token)));
        } catch (ExpiredException $exception) {
            $this->reject('token_expired', 'The upstream id_token has expired.', $exception);
        } catch (BeforeValidException $exception) {
            $this->reject('token_not_yet_valid', 'The upstream id_token is not yet valid.', $exception);
        } catch (Throwable $exception) {
            $this->reject('signature_invalid', 'The upstream id_token could not be verified.', $exception);
        }

        return json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuer(array $claims): void
    {
        $issuer = is_string($claims['iss'] ?? null) ? rtrim($claims['iss'], '/') : null;

        if ($issuer === null || ! in_array($issuer, $this->expectedIssuers(), true)) {
            $this->reject('invalid_issuer', 'The upstream issuer is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertAudience(array $claims): void
    {
        if (! in_array($this->expectedAudience(), $this->audiences($claims), true)) {
            $this->reject('invalid_audience', 'The upstream audience is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return list<string>
     */
    private function audiences(array $claims): array
    {
        $audience = $claims['aud'] ?? null;

        if (is_string($audience) && $audience !== '') {
            return [$audience];
        }

        return array_values(array_filter(is_array($audience) ? $audience : [], 'is_string'));
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertExpiry(array $claims): void
    {
        $expiresAt = $claims['exp'] ?? null;

        if (! is_int($expiresAt)) {
            $this->reject('missing_exp', 'The upstream id_token exp claim is invalid.');
        }

        if ($expiresAt < time() - $this->clockSkewSeconds()) {
            $this->reject('token_expired', 'The upstream id_token has expired.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuedAt(array $claims): void
    {
        $issuedAt = $claims['iat'] ?? null;

        if (! is_int($issuedAt)) {
            $this->reject('missing_iat', 'The upstream id_token iat claim is invalid.');
        }

        if ($issuedAt > time() + $this->clockSkewSeconds()) {
            $this->reject('invalid_iat', 'The upstream id_token issued-at is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertNonce(array $claims, string $expectedNonce): void
    {
        $nonce = is_string($claims['nonce'] ?? null) ? $claims['nonce'] : null;

        if ($expectedNonce === '' || $nonce === null || ! hash_equals($expectedNonce, $nonce)) {
            $this->reject('invalid_nonce', 'The upstream nonce is invalid.');
        }
    }

    private function jwksUrl(): string
    {
        return $this->metadata->internalEndpoint('jwks_uri');
    }

    /**
     * @return array<string, mixed>
     */
    private function jwksFor(string $token): array
    {
        return $this->jwks->document($this->jwksUrl(), JwtHeader::keyId($token));
    }

    /**
     * @return list<string>
     */
    private function expectedIssuers(): array
    {
        return $this->metadata->validIssuers();
    }

    private function expectedAudience(): string
    {
        return (string) config('sso.broker.client_id');
    }

    private function clockSkewSeconds(): int
    {
        return (int) config('sso.jwt.clock_skew_seconds', 60);
    }

    private function assertAllowedAlgorithm(string $token): void
    {
        try {
            $algorithm = JwtHeader::algorithm($token);
        } catch (Throwable $exception) {
            $this->reject('invalid_header', 'The upstream JWT header is invalid.', $exception);
        }

        if ($algorithm === 'none') {
            $this->reject('alg_none', 'Unsigned upstream JWTs are not accepted.');
        }

        if (! in_array($algorithm, $this->allowedAlgorithms(), true)) {
            $this->reject('alg_not_allowed', 'The upstream JWT algorithm is not allowed.');
        }
    }

    /**
     * @return list<string>
     */
    private function allowedAlgorithms(): array
    {
        /** @var list<string> $algorithms */
        $algorithms = config('sso.jwt.upstream_allowed_algs', ['RS256']);

        return $algorithms;
    }

    private function reject(string $reason, string $message, ?Throwable $previous = null): never
    {
        $this->metrics->increment($reason);

        throw new RuntimeException($message, 0, $previous);
    }
}
