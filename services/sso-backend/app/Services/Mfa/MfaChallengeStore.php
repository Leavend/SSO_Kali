<?php

declare(strict_types=1);

namespace App\Services\Mfa;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Throwable;

/**
 * FR-018: Cache-based MFA challenge state.
 *
 * Stores challenge metadata (user_id, attempts) in Redis/cache
 * with a 5-minute TTL. Max 5 verification attempts per challenge.
 */
final class MfaChallengeStore
{
    private const int TTL_SECONDS = 300; // 5 minutes

    private const int MAX_ATTEMPTS = 5;

    private const string PREFIX = 'mfa_challenge:';

    /**
     * Create a new challenge for a user.
     *
     * BE-FR019-001: optional `oidc_context` is the server-side authoritative
     * pending OIDC authorization request that MUST be redeemed only after the
     * MFA challenge succeeds. The context never leaves the server; the client
     * only ever sees the opaque challenge id.
     *
     * @param  array<string, mixed>|null  $oidcContext
     * @return array{challenge_id: string, expires_at: string}
     */
    public function create(int $userId, ?array $oidcContext = null): array
    {
        $challengeId = (string) Str::uuid();
        $expiresAt = now()->addSeconds(self::TTL_SECONDS);

        Cache::put(self::PREFIX.$challengeId, [
            'user_id' => $userId,
            'attempts' => 0,
            'created_at' => now()->toIso8601String(),
            'expires_at' => $expiresAt->toIso8601String(),
            'oidc_context' => $oidcContext,
        ], self::TTL_SECONDS);

        return [
            'challenge_id' => $challengeId,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /**
     * Retrieve challenge data. Returns null if expired or not found.
     *
     * @return array{user_id: int, attempts: int, created_at: string, expires_at?: string, oidc_context?: array<string, mixed>|null}|null
     */
    public function find(string $challengeId): ?array
    {
        $data = Cache::get(self::PREFIX.$challengeId);

        return is_array($data) ? $data : null;
    }

    /**
     * BE-FR019-001: read the server-side pending OIDC authorization context.
     *
     * @return array<string, mixed>|null
     */
    public function pendingOidcContext(string $challengeId): ?array
    {
        $data = $this->find($challengeId);

        if ($data === null) {
            return null;
        }

        $context = $data['oidc_context'] ?? null;

        return is_array($context) ? $context : null;
    }

    /**
     * Record a verification attempt, returning a distinct outcome so the caller
     * can surface the correct error (expiry vs lockout vs not-found) instead of
     * collapsing every failure into a single "maximum attempts exceeded".
     */
    public function incrementAttempt(string $challengeId): MfaAttemptOutcome
    {
        $data = $this->find($challengeId);

        if ($data === null) {
            return MfaAttemptOutcome::NotFound;
        }

        if ($data['attempts'] >= self::MAX_ATTEMPTS) {
            $this->consume($challengeId);

            return MfaAttemptOutcome::MaxAttemptsReached;
        }

        $data['attempts']++;
        $ttl = $this->remainingTtl($data);
        if ($ttl <= 0) {
            $this->consume($challengeId);

            return MfaAttemptOutcome::Expired;
        }

        Cache::put(self::PREFIX.$challengeId, $data, $ttl);

        return MfaAttemptOutcome::Recorded;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function remainingTtl(array $data): int
    {
        $expiresAt = is_string($data['expires_at'] ?? null) ? $data['expires_at'] : null;
        if ($expiresAt === null) {
            // Fail closed. Every challenge created by this store carries an
            // absolute expires_at, so a missing one means a legacy/pre-deploy
            // entry. Treating it as the full TTL would silently re-arm the
            // brute-force window on every failed verify; treat it as expired.
            return 0;
        }

        try {
            return max(0, Carbon::parse($expiresAt)->getTimestamp() - now()->getTimestamp());
        } catch (Throwable) {
            return 0;
        }
    }

    /**
     * Consume (delete) a challenge after successful verification.
     */
    public function consume(string $challengeId): void
    {
        Cache::forget(self::PREFIX.$challengeId);
    }
}
