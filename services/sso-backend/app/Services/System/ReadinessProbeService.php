<?php

declare(strict_types=1);

namespace App\Services\System;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

final class ReadinessProbeService
{
    /**
     * @return array{ready: bool, checks: array{database: bool, redis: bool}}
     */
    public function inspect(): array
    {
        $checks = [
            'database' => $this->databaseIsReady(),
            'redis' => $this->redisIsReady(),
        ];

        return [
            'ready' => ! in_array(false, $checks, true),
            'checks' => $checks,
        ];
    }

    private function databaseIsReady(): bool
    {
        try {
            DB::select('select 1');

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function redisIsReady(): bool
    {
        try {
            return Redis::connection()->ping() !== false;
        } catch (Throwable) {
            return false;
        }
    }
}
