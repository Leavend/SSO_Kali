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

        return is_array($payload) ? $payload : null;
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
        return [
            'sid' => $claims['sid'],
            'subject' => $claims['sub'],
            'client_id' => $claims['client_id'],
            'access_token' => $tokens['access_token'],
            'refresh_token' => is_string($tokens['refresh_token'] ?? null) ? $tokens['refresh_token'] : null,
            'id_token' => $tokens['id_token'],
            'profile' => $profile['resource_profile'] ?? [],
        ];
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
