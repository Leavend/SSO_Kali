<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Support\Carbon;

final class AdminAuditTrailQuery
{
    private const DEFAULT_LIMIT = 50;

    private const MAX_LIMIT = 100;

    /**
     * @param  array<string, mixed>  $filters
     * @return CursorPaginator<int, AdminAuditEvent>
     */
    public function list(array $filters): CursorPaginator
    {
        $query = AdminAuditEvent::query()->orderByDesc('id');

        foreach (['action', 'outcome', 'taxonomy', 'admin_subject_id'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $query->where($field, $filters[$field]);
            }
        }

        if (is_string($filters['request_id'] ?? null) && $filters['request_id'] !== '') {
            $needle = $filters['request_id'];
            if (SupportReference::isExplicitRef($needle)) {
                $query->where(SupportReference::whereIndexedOrRequestId($needle));
            } else {
                $query->where('request_id', $needle);
            }
        }

        if (is_string($filters['subject_id'] ?? null) && $filters['subject_id'] !== '') {
            $query->where(function ($query) use ($filters): void {
                $query
                    ->where('subject_id', $filters['subject_id'])
                    ->orWhere('target_subject_id', $filters['subject_id']);
            });
        }

        foreach (['client_id', 'session_id'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $query->where($field, $filters[$field]);
            }
        }

        if (is_string($filters['support_reference'] ?? null) && $filters['support_reference'] !== '') {
            $query->where(SupportReference::whereIndexedOrRequestId($filters['support_reference']));
        }

        if (is_string($filters['from'] ?? null) && $filters['from'] !== '') {
            $query->where('occurred_at', '>=', Carbon::parse($filters['from']));
        }

        if (is_string($filters['to'] ?? null) && $filters['to'] !== '') {
            $query->where('occurred_at', '<=', Carbon::parse($filters['to']));
        }

        return $query->cursorPaginate(
            perPage: $this->limit($filters['limit'] ?? null),
            cursorName: 'cursor',
            cursor: $filters['cursor'] ?? null,
        );
    }

    public function find(string $eventId): ?AdminAuditEvent
    {
        return AdminAuditEvent::query()->where('event_id', $eventId)->first();
    }

    private function limit(mixed $limit): int
    {
        if (! is_numeric($limit)) {
            return self::DEFAULT_LIMIT;
        }

        return max(1, min(self::MAX_LIMIT, (int) $limit));
    }
}
