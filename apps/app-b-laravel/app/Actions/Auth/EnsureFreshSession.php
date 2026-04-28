<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Sso\AppSessionStore;
use App\Services\Sso\BrokerTokenVerifier;
use App\Services\Sso\SsoHttpClient;
use RuntimeException;
use Throwable;

final class EnsureFreshSession
{
    public function __construct(
        private readonly AppSessionStore $sessions,
        private readonly SsoHttpClient $client,
        private readonly BrokerTokenVerifier $tokens,
    ) {}

    /**
     * @return array<string, mixed>|null
     */
    public function handle(): ?array
    {
        $session = $this->sessions->current();

        if ($session === null) {
            return null;
        }

        return $this->usableSession($session);
    }

    /**
     * @param  array<string, mixed>  $session
     * @return array<string, mixed>|null
     */
    private function usableSession(array $session): ?array
    {
        if ($this->localSessionExpired($session)) {
            return $this->expire();
        }

        return $this->accessTokenFresh($session)
            ? $this->sessions->touchCurrent()
            : $this->refresh($session);
    }

    /**
     * @param  array<string, mixed>  $session
     * @return array<string, mixed>|null
     */
    private function refresh(array $session): ?array
    {
        $refreshToken = $this->refreshToken($session);

        if ($refreshToken === null) {
            return $this->expire();
        }

        return $this->rotate($session, $refreshToken);
    }

    /**
     * @param  array<string, mixed>  $session
     * @return array<string, mixed>|null
     */
    private function rotate(array $session, string $refreshToken): ?array
    {
        try {
            $tokenPayload = $this->client->refreshTokens($refreshToken);
            $claims = $this->tokens->verifyAccessToken((string) $tokenPayload['access_token']);
            $this->assertSameSession($session, $claims);

            return $this->sessions->replaceAuthenticatedTokens($tokenPayload, $claims);
        } catch (Throwable $exception) {
            report($exception);

            return $this->expire();
        }
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function localSessionExpired(array $session): bool
    {
        return $this->idleExpired($session) || $this->absoluteExpired($session);
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function idleExpired(array $session): bool
    {
        return time() - $this->integer($session, 'last_touched_at') > $this->idleTtl();
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function absoluteExpired(array $session): bool
    {
        return time() - $this->integer($session, 'created_at') > $this->absoluteTtl();
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function accessTokenFresh(array $session): bool
    {
        return $this->integer($session, 'expires_at') - time() > $this->refreshSkew();
    }

    /**
     * @param  array<string, mixed>  $session
     */
    private function refreshToken(array $session): ?string
    {
        return is_string($session['refresh_token'] ?? null) ? $session['refresh_token'] : null;
    }

    /**
     * @param  array<string, mixed>  $session
     * @param  array<string, mixed>  $claims
     */
    private function assertSameSession(array $session, array $claims): void
    {
        if (($claims['sid'] ?? null) !== $session['sid']) {
            throw new RuntimeException('Refreshed token sid mismatch.');
        }

        if (($claims['sub'] ?? null) !== $session['subject']) {
            throw new RuntimeException('Refreshed token subject mismatch.');
        }
    }

    private function expire(): null
    {
        $this->sessions->clearCurrent();

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function integer(array $payload, string $key): int
    {
        return is_int($payload[$key] ?? null) ? $payload[$key] : time();
    }

    private function idleTtl(): int
    {
        return max(1, (int) config('services.sso.session.idle_ttl_seconds', 604800));
    }

    private function absoluteTtl(): int
    {
        return max(1, (int) config('services.sso.session.absolute_ttl_seconds', 2592000));
    }

    private function refreshSkew(): int
    {
        return max(1, (int) config('services.sso.session.refresh_skew_seconds', 90));
    }
}
