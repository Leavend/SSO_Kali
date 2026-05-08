<?php

declare(strict_types=1);

namespace App\Services\System;

use Illuminate\Support\Facades\DB;
use Throwable;

final class QueueObservabilityService
{
    /**
     * @return array{pending_jobs: int, failed_jobs: int, oldest_pending_age_seconds: int|null}
     */
    public function snapshot(): array
    {
        return [
            'pending_jobs' => $this->countPendingJobs(),
            'failed_jobs' => $this->countFailedJobs(),
            'oldest_pending_age_seconds' => $this->oldestPendingAgeSeconds(),
        ];
    }

    private function countPendingJobs(): int
    {
        try {
            return (int) DB::table('jobs')->count();
        } catch (Throwable) {
            return 0;
        }
    }

    private function countFailedJobs(): int
    {
        try {
            return (int) DB::table('failed_jobs')->count();
        } catch (Throwable) {
            return 0;
        }
    }

    private function oldestPendingAgeSeconds(): ?int
    {
        try {
            $createdAt = DB::table('jobs')->min('created_at');
        } catch (Throwable) {
            return null;
        }

        if (! is_numeric($createdAt)) {
            return null;
        }

        return max(0, time() - (int) $createdAt);
    }
}
