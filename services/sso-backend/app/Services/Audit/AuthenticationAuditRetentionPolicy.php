<?php

declare(strict_types=1);

namespace App\Services\Audit;

use App\Models\AuthenticationAuditEvent;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

final class AuthenticationAuditRetentionPolicy
{
    private const DEFAULT_RETENTION_DAYS = 400;

    private const MINIMUM_RETENTION_DAYS = 90;

    private const MAXIMUM_RETENTION_DAYS = 2555;

    public function retentionDays(): int
    {
        $days = config('sso.audit.authentication_retention_days', self::DEFAULT_RETENTION_DAYS);

        if (! is_numeric($days)) {
            return self::DEFAULT_RETENTION_DAYS;
        }

        return max(self::MINIMUM_RETENTION_DAYS, min(self::MAXIMUM_RETENTION_DAYS, (int) $days));
    }

    public function cutoff(): Carbon
    {
        return now()->subDays($this->retentionDays());
    }

    public function candidateCount(?Carbon $cutoff = null): int
    {
        return AuthenticationAuditEvent::query()
            ->where('occurred_at', '<', $cutoff ?? $this->cutoff())
            ->count();
    }

    public function prune(?Carbon $cutoff = null, int $limit = 1000): int
    {
        if ($limit < 1) {
            throw new InvalidArgumentException('Authentication audit prune limit must be at least 1.');
        }

        $ids = AuthenticationAuditEvent::query()
            ->where('occurred_at', '<', $cutoff ?? $this->cutoff())
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id')
            ->all();

        if ($ids === []) {
            return 0;
        }

        return AuthenticationAuditEvent::query()
            ->whereIn('id', $ids)
            ->delete();
    }

    /**
     * @return array{retention_days: int, minimum_retention_days: int, maximum_retention_days: int, cutoff: string, candidate_count: int}
     */
    public function report(?Carbon $cutoff = null): array
    {
        $cutoff ??= $this->cutoff();

        return [
            'retention_days' => $this->retentionDays(),
            'minimum_retention_days' => self::MINIMUM_RETENTION_DAYS,
            'maximum_retention_days' => self::MAXIMUM_RETENTION_DAYS,
            'cutoff' => $cutoff->toIso8601String(),
            'candidate_count' => $this->candidateCount($cutoff),
        ];
    }
}
