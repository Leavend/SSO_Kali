<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use RuntimeException;
use Throwable;

final class LogoutTokenVerifier
{
    public function __construct(
        private readonly BrokerJwksCache $jwks,
        private readonly JwtRejectMetrics $metrics,
        private readonly LogoutTokenReplayStore $replays,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function claims(string $token): array
    {
        $this->assertAllowedAlgorithm($token);
        $claims = $this->decode($token);
        $this->assertIssuer($claims);
        $this->assertAudience($claims);
        $this->assertExpiry($claims);
        $this->assertIssuedAt($claims);
        $this->assertSubjectOrSession($claims);
        $this->assertStringClaim($claims, 'jti');
        $this->assertEvents($claims);
        $this->assertNoNonce($claims);
        $this->replays->remember((string) $claims['jti'], (int) $claims['exp']);

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
            $this->reject('token_expired', 'Logout token has expired.', $exception);
        } catch (BeforeValidException $exception) {
            $this->reject('token_not_yet_valid', 'Logout token is not yet valid.', $exception);
        } catch (Throwable $exception) {
            $this->reject('signature_invalid', 'Logout token could not be verified.', $exception);
        }

        return json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
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

    private function clockSkewSeconds(): int
    {
        return (int) config('services.sso.jwt.clock_skew_seconds', 60);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuer(array $claims): void
    {
        if (($claims['iss'] ?? null) !== config('services.sso.public_issuer')) {
            $this->reject('invalid_issuer', 'The logout token issuer is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertAudience(array $claims): void
    {
        if (! in_array((string) config('services.sso.client_id'), $this->audiences($claims), true)) {
            $this->reject('invalid_audience', 'The logout token audience is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertExpiry(array $claims): void
    {
        $expiresAt = $claims['exp'] ?? null;

        if (! is_int($expiresAt)) {
            $this->reject('missing_exp', 'The logout token exp claim is invalid.');
        }

        if ($expiresAt < time() - $this->clockSkewSeconds()) {
            $this->reject('token_expired', 'Logout token has expired.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuedAt(array $claims): void
    {
        $issuedAt = $claims['iat'] ?? null;

        if (! is_int($issuedAt)) {
            $this->reject('missing_iat', 'The logout token iat claim is invalid.');
        }

        if ($issuedAt > time() + $this->clockSkewSeconds()) {
            $this->reject('invalid_iat', 'The logout token issued-at is invalid.');
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
    private function assertSubjectOrSession(array $claims): void
    {
        $hasSubject = is_string($claims['sub'] ?? null) && $claims['sub'] !== '';
        $hasSession = is_string($claims['sid'] ?? null) && $claims['sid'] !== '';

        if (! $hasSubject && ! $hasSession) {
            $this->reject('missing_subject_or_sid', 'The logout token subject/session claims are invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertEvents(array $claims): void
    {
        $events = $claims['events'] ?? null;

        if (! is_array($events) || ! array_key_exists('http://schemas.openid.net/event/backchannel-logout', $events)) {
            $this->reject('invalid_events', 'The logout token events claim is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertNoNonce(array $claims): void
    {
        if (array_key_exists('nonce', $claims)) {
            $this->reject('invalid_nonce', 'Logout tokens must not contain a nonce claim.');
        }
    }

    private function assertAllowedAlgorithm(string $token): void
    {
        try {
            $algorithm = JwtHeader::algorithm($token);
        } catch (Throwable $exception) {
            $this->reject('invalid_header', 'The logout token header is invalid.', $exception);
        }

        if ($algorithm === 'none') {
            $this->reject('alg_none', 'Unsigned logout tokens are not accepted.');
        }

        if (! in_array($algorithm, $this->allowedAlgorithms(), true)) {
            $this->reject('alg_not_allowed', 'The logout token algorithm is not allowed.');
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
