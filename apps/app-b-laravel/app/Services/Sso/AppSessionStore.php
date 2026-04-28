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
        $payload !== null && $this->remove((string) $payload['sid'], session()->getId());

        Auth::logout();
        session()->forget(['sso.session', 'sso.transaction']);
        session()->invalidate();
        session()->regenerateToken();
    }

    public function destroyBySid(string $sid): int
    {
        $sessionIds = $this->sessionIds($sid);

        if ($sessionIds === []) {
            return 0;
        }

        DB::table('sessions')->whereIn('id', $sessionIds)->delete();
        Cache::forget($this->key($sid));

        return count($sessionIds);
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
        $sessionIds = $this->sessionIds($sid);
        in_array($sessionId, $sessionIds, true) || $sessionIds[] = $sessionId;

        Cache::put($this->key($sid), $sessionIds, now()->addDays(30));
    }

    private function remove(string $sid, string $sessionId): void
    {
        $sessionIds = array_values(array_filter(
            $this->sessionIds($sid),
            static fn (string $candidate): bool => $candidate !== $sessionId,
        ));

        $sessionIds === [] ? Cache::forget($this->key($sid)) : Cache::put($this->key($sid), $sessionIds, now()->addDays(30));
    }

    /**
     * @return list<string>
     */
    private function sessionIds(string $sid): array
    {
        $payload = Cache::get($this->key($sid), []);

        return array_values(array_filter(is_array($payload) ? $payload : [], 'is_string'));
    }

    private function key(string $sid): string
    {
        return 'app-b:sid:'.$sid;
    }
}
