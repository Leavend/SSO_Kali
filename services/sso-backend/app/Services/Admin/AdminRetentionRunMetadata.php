<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Illuminate\Support\Facades\Cache;

final class AdminRetentionRunMetadata
{
    private const PREFIX = 'admin_retention:last_run:';

    public function record(string $category, int $prunedCount): void
    {
        Cache::forever($this->key($category), [
            'last_pruned_at' => now()->toIso8601String(),
            'last_pruned_count' => max(0, $prunedCount),
        ]);
    }

    /** @return array{last_pruned_at: string|null, last_pruned_count: int|null} */
    public function get(string $category): array
    {
        $value = Cache::get($this->key($category));

        if (! is_array($value)) {
            return ['last_pruned_at' => null, 'last_pruned_count' => null];
        }

        $lastPrunedAt = $value['last_pruned_at'] ?? null;
        $lastPrunedCount = $value['last_pruned_count'] ?? null;

        return [
            'last_pruned_at' => is_string($lastPrunedAt) ? $lastPrunedAt : null,
            'last_pruned_count' => is_numeric($lastPrunedCount) ? (int) $lastPrunedCount : null,
        ];
    }

    private function key(string $category): string
    {
        return self::PREFIX.$category;
    }
}
