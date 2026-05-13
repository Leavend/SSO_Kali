<?php

declare(strict_types=1);

namespace App\Services\Mfa;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

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
     * @return array{challenge_id: string, expires_at: string}
     */
    public function create(int $userId): array
    {
        $challengeId = (string) Str::uuid();
        $expiresAt = now()->addSeconds(self::TTL_SECONDS);

        Cache::put(self::PREFIX.$challengeId, [
            'user_id' => $userId,
            'attempts' => 0,
            'created_at' => now()->toIso8601String(),
        ], self::TTL_SECONDS);

        return [
            'challenge_id' => $challengeId,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /**
     * Retrieve challenge data. Returns null if expired or not found.
     *
     * @return array{user_id: int, attempts: int, created_at: string}|null
     */
    public function find(string $challengeId): ?array
    {
        $data = Cache::get(self::PREFIX.$challengeId);

        return is_array($data) ? $data : null;
    }

    /**
     * Increment attempt count. Returns false if max attempts exceeded.
     */
    public function incrementAttempt(string $challengeId): bool
    {
        $data = $this->find($challengeId);

        if ($data === null) {
            return false;
        }

        if ($data['attempts'] >= self::MAX_ATTEMPTS) {
            $this->consume($challengeId);

            return false;
        }

        $data['attempts']++;
        $ttl = Cache::getStore()->get(self::PREFIX.$challengeId) !== null
            ? self::TTL_SECONDS
            : 0;

        Cache::put(self::PREFIX.$challengeId, $data, $ttl);

        return true;
    }

    /**
     * Consume (delete) a challenge after successful verification.
     */
    public function consume(string $challengeId): void
    {
        Cache::forget(self::PREFIX.$challengeId);
    }
}
