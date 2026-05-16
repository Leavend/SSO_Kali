<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use RuntimeException;

final class LocalLogoutTokenVerifier
{
    public function __construct(
        private readonly SigningKeyService $keys,
        private readonly LogoutTokenReplayStore $replayStore,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function verify(string $token, string $audience): array
    {
        $claims = $this->keys->decode($token);

        $this->assertIssuer($claims);
        $this->assertAudience($claims, $audience);
        $this->assertTimes($claims);
        $this->assertLogoutEvent($claims);
        $this->assertNonceAbsent($claims);
        $this->assertSubjectOrSession($claims);
        $this->assertJtiSingleUse($claims, $audience);

        return $claims;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertIssuer(array $claims): void
    {
        if (($claims['iss'] ?? null) !== config('sso.issuer')) {
            throw new RuntimeException('Logout token issuer is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertAudience(array $claims, string $audience): void
    {
        if (! in_array($audience, $this->audiences($claims['aud'] ?? null), true)) {
            throw new RuntimeException('Logout token audience is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertTimes(array $claims): void
    {
        $skew = (int) config('sso.jwt.clock_skew_seconds', 60);
        $now = time();
        $exp = $this->timestamp($claims['exp'] ?? null);
        $iat = $this->timestamp($claims['iat'] ?? null);

        if ($exp === null || $exp < ($now - $skew) || $iat === null || $iat > ($now + $skew)) {
            throw new RuntimeException('Logout token timing is invalid.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertLogoutEvent(array $claims): void
    {
        $events = $claims['events'] ?? null;

        if (! is_array($events) || ! array_key_exists($this->eventKey(), $events)) {
            throw new RuntimeException('Logout token event is missing.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertNonceAbsent(array $claims): void
    {
        if (array_key_exists('nonce', $claims)) {
            throw new RuntimeException('Logout token nonce is not allowed.');
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
            throw new RuntimeException('Logout token subject is missing.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertJtiSingleUse(array $claims, string $audience): void
    {
        $jti = $claims['jti'] ?? null;

        if (! is_string($jti) || $jti === '') {
            throw new RuntimeException('Logout token jti is missing.');
        }

        $exp = $this->timestamp($claims['exp'] ?? null);

        if ($exp === null) {
            throw new RuntimeException('Logout token timing is invalid.');
        }

        $accepted = $this->replayStore->register($audience, $jti, $exp, time());

        if (! $accepted) {
            throw new RuntimeException('Logout token jti has already been used.');
        }
    }

    /**
     * @return list<string>
     */
    private function audiences(mixed $value): array
    {
        if (is_string($value) && $value !== '') {
            return [$value];
        }

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn (mixed $item): bool => is_string($item) && $item !== ''));
    }

    private function timestamp(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        return is_string($value) && ctype_digit($value) ? (int) $value : null;
    }

    private function eventKey(): string
    {
        return 'http://schemas.openid.net/event/backchannel-logout';
    }
}
