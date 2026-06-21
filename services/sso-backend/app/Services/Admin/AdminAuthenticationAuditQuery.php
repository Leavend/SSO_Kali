<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AuthenticationAuditEvent;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

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

        if (is_string($filters['outcome'] ?? null) && $filters['outcome'] !== '') {
            $query->where('outcome', $filters['outcome']);
        }

        if (is_string($filters['event_type'] ?? null) && $filters['event_type'] !== '') {
            $query->where('event_type', strtolower($filters['event_type']));
        }

        if (is_string($filters['error_code'] ?? null) && $filters['error_code'] !== '') {
            $query->whereRaw('LOWER(error_code) LIKE ?', ['%'.strtolower($filters['error_code']).'%']);
        }

        foreach (['request_id', 'subject_id', 'client_id', 'session_id'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $this->applyCorrelationFilter($query, $field, $filters[$field]);
            }
        }

        // Support Reference: match against request_id suffix (mirrors formatSupportReference derivation).
        if (is_string($filters['support_reference'] ?? null) && $filters['support_reference'] !== '') {
            $suffix = SupportReference::suffixOf($filters['support_reference']);
            if ($suffix !== '') {
                $expr = SupportReference::normalizedColumnExpr('request_id');
                $query->whereRaw("{$expr} LIKE ?", ['%'.$suffix]);
            }
        }

        if (is_string($filters['consent_action'] ?? null) && $filters['consent_action'] !== '') {
            $action = $filters['consent_action'];
            $query->where(function (Builder $q) use ($action): void {
                $q->where('context->consent_action', $action)
                    ->orWhere(function (Builder $q2) use ($action): void {
                        $q2->where('event_type', 'consent_decision')
                            ->where('context->decision', $action);
                    });
            });
        }

        if (is_string($filters['from'] ?? null) && $filters['from'] !== '') {
            $query->where('occurred_at', '>=', $this->parseFilterDate($filters['from'], false));
        }

        if (is_string($filters['to'] ?? null) && $filters['to'] !== '') {
            $query->where('occurred_at', '<=', $this->parseFilterDate($filters['to'], true));
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

    private function applyCorrelationFilter(Builder $query, string $col, string $needle): void
    {
        if (SupportReference::isExplicitRef($needle)) {
            $suffix = SupportReference::suffixOf($needle);
            if ($suffix !== '') {
                $expr = SupportReference::normalizedColumnExpr($col);
                $query->whereRaw("{$expr} LIKE ?", ['%'.$suffix]);

                return;
            }
        }

        if ($col === 'client_id') {
            $normalizedNeedle = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $needle) ?? '');
            if ($normalizedNeedle !== '') {
                $expr = SupportReference::normalizedColumnExpr($col);
                $query->where(function (Builder $q) use ($col, $needle, $expr, $normalizedNeedle): void {
                    $q->where($col, $needle)
                        ->orWhereRaw("{$expr} = ?", [$normalizedNeedle]);
                });

                return;
            }
        }

        $query->where($col, $needle);
    }

    private function parseFilterDate(string $value, bool $isEnd): Carbon
    {
        $tz = config('sso.display_timezone', config('app.timezone', 'UTC'));

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($value))) {
            $date = Carbon::createFromFormat('Y-m-d', trim($value), $tz);

            return $isEnd ? $date->endOfDay()->setTimezone('UTC') : $date->startOfDay()->setTimezone('UTC');
        }

        return Carbon::parse($value)->setTimezone('UTC');
    }

    private function limit(mixed $limit): int
    {
        if (! is_numeric($limit)) {
            return self::DEFAULT_LIMIT;
        }

        return max(1, min(self::MAX_LIMIT, (int) $limit));
    }
}
