<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AuthenticationAuditEvent;
use Illuminate\Contracts\Pagination\CursorPaginator;

final class AdminAuthenticationAuditQuery
{
    private const DEFAULT_LIMIT = 50;

    private const MAX_LIMIT = 100;

    /**
     * @param  array<string, mixed>  $filters
     * @return CursorPaginator<int, AuthenticationAuditEvent>
     */
    public function list(array $filters): CursorPaginator
    {
        $query = AuthenticationAuditEvent::query()->orderByDesc('id');

        foreach (['event_type', 'outcome', 'subject_id', 'client_id', 'session_id', 'request_id', 'error_code'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $query->where($field, $filters[$field]);
            }
        }

        if (is_string($filters['from'] ?? null) && $filters['from'] !== '') {
            $query->where('occurred_at', '>=', $filters['from']);
        }

        if (is_string($filters['to'] ?? null) && $filters['to'] !== '') {
            $query->where('occurred_at', '<=', $filters['to']);
        }

        return $query->cursorPaginate(
            perPage: $this->limit($filters['limit'] ?? null),
            cursorName: 'cursor',
            cursor: $filters['cursor'] ?? null,
        );
    }

    public function find(string $eventId): ?AuthenticationAuditEvent
    {
        return AuthenticationAuditEvent::query()->where('event_id', $eventId)->first();
    }

    private function limit(mixed $limit): int
    {
        if (! is_numeric($limit)) {
            return self::DEFAULT_LIMIT;
        }

        return max(1, min(self::MAX_LIMIT, (int) $limit));
    }
}
