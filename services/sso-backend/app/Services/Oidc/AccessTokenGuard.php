<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Jwt\JwtHeader;
use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use RuntimeException;
use Throwable;

final class AccessTokenGuard
{
    public function __construct(
        private readonly SigningKeyService $keys,
        private readonly AccessTokenRevocationStore $revocations,
        private readonly JwtRejectMetrics $metrics,
        private readonly DownstreamClientRegistry $clients,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function claimsFrom(string $token): array
    {
        $this->assertAllowedAlgorithm($token);
        $claims = $this->decode($token);
        $this->assertIssuer($claims);
        $this->assertAudience($claims);
        $this->assertExpiry($claims);
        $this->assertIssuedAt($claims);
        $this->assertTokenUse($claims);
        $this->assertRequiredClaims($claims);
        $this->assertActiveClient($claims);
        $jti = is_string($claims['jti'] ?? null) ? $claims['jti'] : null;

        if ($jti === null || $this->revocations->revoked($jti)) {
            $this->reject('token_revoked', 'The access token has been revoked.');
        }

        return $claims;
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(string $token): array
    {
        try {
            return $this->keys->decode($token);
        } catch (ExpiredException $exception) {
            $this->reject('token_expired', 'The access token has expired.', $exception);
        } catch (BeforeValidException $exception) {
            $this->reject('token_not_yet_valid', 'The access token is not yet valid.', $exception);
        } catch (Throwable $exception) {
            $this->reject('signature_invalid', 'The access token could not be verified.', $exception);
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuer(array $claims): void
    {
        if (($claims['iss'] ?? null) !== config('sso.issuer')) {
            $this->reject('invalid_issuer', 'The access token issuer is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertAudience(array $claims): void
    {
        $audience = $claims['aud'] ?? null;

        if ($audience !== config('sso.resource_audience')) {
            $this->reject('invalid_audience', 'The access token audience is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertExpiry(array $claims): void
    {
        $expiresAt = $claims['exp'] ?? null;

        if (! is_int($expiresAt)) {
            $this->reject('missing_exp', 'The access token exp claim is invalid.');
        }

        if ($expiresAt < time() - $this->clockSkewSeconds()) {
            $this->reject('token_expired', 'The access token has expired.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuedAt(array $claims): void
    {
        $issuedAt = $claims['iat'] ?? null;

        if (! is_int($issuedAt)) {
            $this->reject('missing_iat', 'The access token iat claim is invalid.');
        }

        if ($issuedAt > time() + $this->clockSkewSeconds()) {
            $this->reject('invalid_iat', 'The access token issued-at is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertTokenUse(array $claims): void
    {
        if (($claims['token_use'] ?? null) !== 'access') {
            $this->reject('invalid_token_use', 'The token is not an access token.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertRequiredClaims(array $claims): void
    {
        foreach (['jti', 'sub', 'sid', 'client_id'] as $name) {
            if (! is_string($claims[$name] ?? null) || $claims[$name] === '') {
                $this->reject('missing_'.$name, sprintf('The %s claim is invalid.', $name));
            }
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertActiveClient(array $claims): void
    {
        $clientId = (string) $claims['client_id'];

        if ($this->clients->find($clientId) === null) {
            $this->reject('unknown_client', 'The access token client is not active.');
        }
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
            $this->reject('invalid_header', 'The access token header is invalid.', $exception);
        }

        if ($algorithm === 'none') {
            $this->reject('alg_none', 'Unsigned access tokens are not accepted.');
        }

        if (! in_array($algorithm, $this->allowedAlgorithms(), true)) {
            $this->reject('alg_not_allowed', 'The access token algorithm is not allowed.');
        }
    }

    /**
     * @return list<string>
     */
    private function allowedAlgorithms(): array
    {
        /** @var list<string> $algorithms */
        $algorithms = config('sso.jwt.local_allowed_algs', [(string) config('sso.signing.alg', 'ES256')]);

        return $algorithms;
    }

    private function reject(string $reason, string $message, ?Throwable $previous = null): never
    {
        $this->metrics->increment($reason);

        throw new RuntimeException($message, 0, $previous);
    }
}
