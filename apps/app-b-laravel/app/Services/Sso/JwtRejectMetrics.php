<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Illuminate\Support\Facades\Cache;

final class JwtRejectMetrics
{
    public function increment(string $reason): void
    {
        $key = $this->key($reason);
        $count = Cache::get($key, 0);

        Cache::forever($key, (int) $count + 1);
    }

    public function count(string $reason): int
    {
        return (int) Cache::get($this->key($reason), 0);
    }

    private function key(string $reason): string
    {
        return 'app-b:metrics:jwt_reject_total:'.$reason;
    }
}
