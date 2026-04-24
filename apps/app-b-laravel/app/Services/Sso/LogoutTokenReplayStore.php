<?php

declare(strict_types=1);

namespace App\Services\Sso;

use App\Models\LogoutTokenReplay;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;

final class LogoutTokenReplayStore
{
    public function remember(string $jti, int $expiresAt): void
    {
        $this->pruneExpiredMarker($jti);

        if ($this->createMarker($jti, $expiresAt)) {
            return;
        }

        $this->recordReplay($jti);

        throw new RuntimeException('Logout token replay detected.');
    }

    public function pruneExpired(): int
    {
        return LogoutTokenReplay::query()
            ->where('expires_at', '<', now())
            ->delete();
    }

    public function expiredCount(): int
    {
        return LogoutTokenReplay::query()
            ->where('expires_at', '<', now())
            ->count();
    }

    public function replayAlerts(): int
    {
        return (int) Cache::get($this->metricsKey(), 0);
    }

    private function createMarker(string $jti, int $expiresAt): bool
    {
        try {
            LogoutTokenReplay::query()->create($this->payload($jti, $expiresAt));
        } catch (QueryException $exception) {
            if ($this->hasMarker($jti)) {
                return false;
            }

            throw $exception;
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $jti, int $expiresAt): array
    {
        return [
            'jti' => $jti,
            'expires_at' => now()->setTimestamp($expiresAt),
        ];
    }

    private function recordReplay(string $jti): void
    {
        $count = $this->replayAlerts();

        Cache::forever($this->metricsKey(), $count + 1);
        Log::warning('[BACKCHANNEL_LOGOUT_REPLAY_DETECTED]', ['jti' => $jti]);
    }

    private function pruneExpiredMarker(string $jti): void
    {
        LogoutTokenReplay::query()
            ->where('jti', $jti)
            ->where('expires_at', '<', now())
            ->delete();
    }

    private function hasMarker(string $jti): bool
    {
        return LogoutTokenReplay::query()
            ->where('jti', $jti)
            ->exists();
    }

    private function metricsKey(): string
    {
        return 'app-b:metrics:logout_replay_alert_total';
    }
}
