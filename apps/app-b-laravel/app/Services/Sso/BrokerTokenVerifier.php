<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use RuntimeException;
use Throwable;

final class BrokerTokenVerifier
{
    public function __construct(
        private readonly BrokerJwksCache $jwks,
        private readonly JwtRejectMetrics $metrics,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function verifyAccessToken(string $token): array
    {
        $this->assertAllowedAlgorithm($token);
        $claims = $this->decode($token);
        $this->assertIssuer($claims);
        $this->assertExpiry($claims);
        $this->assertIssuedAt($claims);
        $this->assertAudience($claims, $this->resourceAudience(), 'The access token audience is invalid.');
        $this->assertClientId($claims);
        $this->assertTokenUse($claims, 'access');
        $this->assertStringClaim($claims, 'sid');
        $this->assertStringClaim($claims, 'sub');

        return $claims;
    }

    /**
     * @return array<string, mixed>
     */
    public function verifyIdToken(string $token, string $expectedNonce): array
    {
        $this->assertAllowedAlgorithm($token);
        $claims = $this->decode($token);
        $this->assertIssuer($claims);
        $this->assertExpiry($claims);
        $this->assertIssuedAt($claims);
        $this->assertAudience($claims, $this->clientId(), 'The id_token audience is invalid.');
        $this->assertTokenUse($claims, 'id');
        $this->assertStringClaim($claims, 'sub');
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
            $this->reject('token_expired', 'The broker token has expired.', $exception);
        } catch (BeforeValidException $exception) {
            $this->reject('token_not_yet_valid', 'The broker token is not yet valid.', $exception);
        } catch (Throwable $exception) {
            $this->reject('signature_invalid', 'The broker token could not be verified.', $exception);
        }

        return json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuer(array $claims): void
    {
        if (($claims['iss'] ?? null) !== config('services.sso.public_issuer')) {
            $this->reject('invalid_issuer', 'The broker issuer is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertExpiry(array $claims): void
    {
        $expiresAt = $claims['exp'] ?? null;

        if (! is_int($expiresAt)) {
            $this->reject('missing_exp', 'The broker token exp claim is invalid.');
        }

        if ($expiresAt < time() - $this->clockSkewSeconds()) {
            $this->reject('token_expired', 'The broker token has expired.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuedAt(array $claims): void
    {
        $issuedAt = $claims['iat'] ?? null;

        if (! is_int($issuedAt)) {
            $this->reject('missing_iat', 'The broker token iat claim is invalid.');
        }

        if ($issuedAt > time() + $this->clockSkewSeconds()) {
            $this->reject('invalid_iat', 'The broker token issued-at is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertAudience(array $claims, string $expected, string $message): void
    {
        if (! in_array($expected, $this->audiences($claims), true)) {
            $this->reject('invalid_audience', $message);
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
    private function assertClientId(array $claims): void
    {
        if (($claims['client_id'] ?? null) !== $this->clientId()) {
            $this->reject('invalid_client_id', 'The broker client_id claim is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertTokenUse(array $claims, string $expected): void
    {
        if (($claims['token_use'] ?? null) !== $expected) {
            $this->reject('invalid_token_use', 'The broker token use is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertStringClaim(array $claims, string $name): void
    {
        if (! is_string($claims[$name] ?? null) || $claims[$name] === '') {
            $this->reject('missing_'.$name, sprintf('The %s claim is invalid.', $name));
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertNonce(array $claims, string $expectedNonce): void
    {
        $nonce = is_string($claims['nonce'] ?? null) ? $claims['nonce'] : null;

        if ($expectedNonce === '' || $nonce === null || ! hash_equals($expectedNonce, $nonce)) {
            $this->reject('invalid_nonce', 'The broker nonce is invalid.');
        }
    }

    private function clientId(): string
    {
        return (string) config('services.sso.client_id');
    }

    private function resourceAudience(): string
    {
        return (string) config('services.sso.resource_audience');
    }

    private function clockSkewSeconds(): int
    {
        return (int) config('services.sso.jwt.clock_skew_seconds', 60);
    }

    private function assertAllowedAlgorithm(string $token): void
    {
        try {
            $algorithm = JwtHeader::algorithm($token);
        } catch (Throwable $exception) {
            $this->reject('invalid_header', 'The broker JWT header is invalid.', $exception);
        }

        if ($algorithm === 'none') {
            $this->reject('alg_none', 'Unsigned broker JWTs are not accepted.');
        }

        if (! in_array($algorithm, $this->allowedAlgorithms(), true)) {
            $this->reject('alg_not_allowed', 'The broker JWT algorithm is not allowed.');
        }
    }

    /**
     * @return list<string>
     */
    private function allowedAlgorithms(): array
    {
        /** @var list<string> $algorithms */
        $algorithms = config('services.sso.jwt.allowed_algs', ['ES256', 'RS256']);

        return $algorithms;
    }

    /**
     * @return array<string, mixed>
     */
    private function jwksFor(string $token): array
    {
        return $this->jwks->document(
            (string) config('services.sso.jwks_url'),
            JwtHeader::keyId($token),
        );
    }

    private function reject(string $reason, string $message, ?Throwable $previous = null): never
    {
        $this->metrics->increment($reason);

        throw new RuntimeException($message, 0, $previous);
    }
}
