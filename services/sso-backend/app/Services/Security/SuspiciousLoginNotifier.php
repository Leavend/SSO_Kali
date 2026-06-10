<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Models\User;
use App\Notifications\SuspiciousLoginNotification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class SuspiciousLoginNotifier
{
    public function notify(User $user, string $subjectId, string $ipAddress, string $userAgent): void
    {
        if ($this->isThrottled($subjectId)) {
            return;
        }

        try {
            $user->notify(new SuspiciousLoginNotification(
                ipAddress: $ipAddress,
                userAgent: $userAgent,
                occurredAt: time()
            ));

            $this->rememberSuccess($subjectId);
        } catch (\Throwable $exception) {
            $this->rememberFailure($subjectId);

            Log::error('[SUSPICIOUS_LOGIN_NOTIFICATION_FAILED]', [
                'subject_id' => $subjectId,
                'ip_address' => $ipAddress,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function isThrottled(string $subjectId): bool
    {
        try {
            return Cache::has($this->successCacheKey($subjectId))
                || Cache::has($this->failureCacheKey($subjectId));
        } catch (\Throwable $exception) {
            Log::warning('[SUSPICIOUS_LOGIN_THROTTLE_CHECK_FAILED]', [
                'subject_id' => $subjectId,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    private function rememberSuccess(string $subjectId): void
    {
        try {
            Cache::forget($this->failureCacheKey($subjectId));
            Cache::put($this->successCacheKey($subjectId), true, now()->addMinutes($this->successWindowMinutes()));
        } catch (\Throwable $exception) {
            Log::warning('[SUSPICIOUS_LOGIN_THROTTLE_STORE_FAILED]', [
                'subject_id' => $subjectId,
                'result' => 'success',
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function rememberFailure(string $subjectId): void
    {
        try {
            Cache::put($this->failureCacheKey($subjectId), true, now()->addMinutes($this->failureBackoffMinutes()));
        } catch (\Throwable $exception) {
            Log::warning('[SUSPICIOUS_LOGIN_THROTTLE_STORE_FAILED]', [
                'subject_id' => $subjectId,
                'result' => 'failure',
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function successCacheKey(string $subjectId): string
    {
        return 'suspicious_login_notified:'.$subjectId;
    }

    private function failureCacheKey(string $subjectId): string
    {
        return 'suspicious_login_notify_failed:'.$subjectId;
    }

    private function successWindowMinutes(): int
    {
        return max(1, (int) config('security-notifications.throttle.window_minutes', 60));
    }

    private function failureBackoffMinutes(): int
    {
        $configured = max(1, (int) config('security-notifications.throttle.failure_backoff_minutes', 5));

        return min($configured, $this->successWindowMinutes());
    }
}
