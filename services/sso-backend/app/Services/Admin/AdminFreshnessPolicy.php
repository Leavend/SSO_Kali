<?php

declare(strict_types=1);

namespace App\Services\Admin;

final class AdminFreshnessPolicy
{
    public function window(string $level): int
    {
        return match ($level) {
            'step_up' => (int) config('sso.admin.freshness.step_up_seconds', 300),
            default => (int) config('sso.admin.freshness.read_seconds', 900),
        };
    }

    public function reason(string $level): string
    {
        return $level === 'step_up' ? 'step_up_required' : 'stale_auth';
    }

    public function stale(?int $authTime, string $level): bool
    {
        if ($authTime === null) {
            return true;
        }

        return $authTime < time() - $this->window($level);
    }
}
