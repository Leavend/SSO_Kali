<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class AppSessionStore
{
    /**
     * @param  array<string, string>  $transaction
     */
    public function storeTransaction(array $transaction): void
    {
        session(['sso.transaction' => $transaction]);
    }

    /**
     * @return array<string, string>|null
     */
    public function pullTransaction(): ?array
    {
        $transaction = session('sso.transaction');
        session()->forget('sso.transaction');

        return is_array($transaction) ? $transaction : null;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $profile
     */
    public function storeAuthenticatedSession(array $claims, array $tokens, array $profile): void
    {
        session(['sso.session' => $this->payload($claims, $tokens, $profile)]);
        $this->index((string) $claims['sid'], session()->getId());
        $this->indexSubject((string) $claims['sub'], session()->getId());
    }

    /**
     * @return array<string, mixed>|null
     */
    public function current(): ?array
    {
        $payload = session('sso.session');

        return is_array($payload) ? $this->normalize($payload) : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function touchCurrent(): ?array
    {
        $payload = $this->current();
        if ($payload === null) {
            return null;
        }

        return $this->put(array_replace($payload, ['last_touched_at' => time()]));
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>|null
     */
    public function replaceAuthenticatedTokens(array $tokens, array $claims): ?array
    {
        $payload = $this->current();
        if ($payload === null) {
            return null;
        }

        return $this->put($this->refreshedPayload($payload, $tokens, $claims));
    }

    public function clearCurrent(): void
    {
        $payload = $this->current();
        if ($payload !== null) {
            $this->remove((string) $payload['sid'], session()->getId());
            $this->removeSubject((string) $payload['subject'], session()->getId());
        }

        Auth::logout();
        session()->forget(['sso.session', 'sso.transaction']);
        session()->invalidate();
        session()->regenerateToken();
    }

    public function destroyBySid(string $sid): int
    {
        return $this->destroyIndexed($this->key($sid));
    }

    public function destroyBySubject(string $subject): int
    {
        return $this->destroyIndexed($this->subjectKey($subject));
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $profile
     * @return array<string, mixed>
     */
    private function payload(array $claims, array $tokens, array $profile): array
    {
        $now = time();

        return [
            'sid' => $claims['sid'],
            'subject' => $claims['sub'],
            'client_id' => $claims['client_id'],
            'access_token' => $tokens['access_token'],
            'refresh_token' => is_string($tokens['refresh_token'] ?? null) ? $tokens['refresh_token'] : null,
            'id_token' => $tokens['id_token'],
            'expires_at' => $this->integerClaim($claims, 'exp', $now),
            'created_at' => $now,
            'last_touched_at' => $now,
            'last_refreshed_at' => $now,
            'profile' => $profile['resource_profile'] ?? [],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function refreshedPayload(array $payload, array $tokens, array $claims): array
    {
        $now = time();

        return array_replace($payload, [
            'access_token' => $tokens['access_token'],
            'refresh_token' => $this->refreshToken($tokens, $payload),
            'id_token' => $tokens['id_token'] ?? $payload['id_token'],
            'expires_at' => $this->integerClaim($claims, 'exp', $now),
            'last_refreshed_at' => $now,
            'last_touched_at' => $now,
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalize(array $payload): array
    {
        $now = time();

        return array_replace($payload, [
            'expires_at' => $this->integerClaim($payload, 'expires_at', $now),
            'created_at' => $this->integerClaim($payload, 'created_at', $now),
            'last_touched_at' => $this->integerClaim($payload, 'last_touched_at', $now),
            'last_refreshed_at' => $this->integerClaim($payload, 'last_refreshed_at', $now),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function put(array $payload): array
    {
        session(['sso.session' => $payload]);

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $payload
     */
    private function refreshToken(array $tokens, array $payload): ?string
    {
        return is_string($tokens['refresh_token'] ?? null)
            ? $tokens['refresh_token']
            : (is_string($payload['refresh_token'] ?? null) ? $payload['refresh_token'] : null);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function integerClaim(array $payload, string $key, int $fallback): int
    {
        return is_int($payload[$key] ?? null) ? $payload[$key] : $fallback;
    }

    private function index(string $sid, string $sessionId): void
    {
        $sessionIds = $this->indexedSessionIds($this->key($sid));
        in_array($sessionId, $sessionIds, true) || $sessionIds[] = $sessionId;

        Cache::put($this->key($sid), $sessionIds, now()->addDays(30));
    }

    private function remove(string $sid, string $sessionId): void
    {
        $this->removeIndexed($this->key($sid), $sessionId);
    }

    private function indexSubject(string $subject, string $sessionId): void
    {
        $sessionIds = $this->indexedSessionIds($this->subjectKey($subject));
        in_array($sessionId, $sessionIds, true) || $sessionIds[] = $sessionId;

        Cache::put($this->subjectKey($subject), $sessionIds, now()->addDays(30));
    }

    private function removeSubject(string $subject, string $sessionId): void
    {
        $this->removeIndexed($this->subjectKey($subject), $sessionId);
    }

    /**
     * @return list<string>
     */
    private function indexedSessionIds(string $key): array
    {
        $payload = Cache::get($key, []);

        return array_values(array_filter(is_array($payload) ? $payload : [], 'is_string'));
    }

    private function destroyIndexed(string $key): int
    {
        $sessionIds = $this->indexedSessionIds($key);
        if ($sessionIds === []) {
            return 0;
        }

        $deleted = DB::table('sessions')->whereIn('id', $sessionIds)->delete();
        Cache::forget($key);

        return $deleted;
    }

    private function removeIndexed(string $key, string $sessionId): void
    {
        $sessionIds = array_values(array_filter(
            $this->indexedSessionIds($key),
            static fn (string $candidate): bool => $candidate !== $sessionId,
        ));

        $sessionIds === [] ? Cache::forget($key) : Cache::put($key, $sessionIds, now()->addDays(30));
    }

    private function key(string $sid): string
    {
        return 'app-b:sid:'.$sid;
    }

    private function subjectKey(string $subject): string
    {
        return 'app-b:subject:'.$subject;
    }
}
