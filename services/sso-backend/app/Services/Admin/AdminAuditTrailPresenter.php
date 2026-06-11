<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Support\Carbon;

final class AdminAuditTrailPresenter
{
    /**
     * @param  CursorPaginator<int, AdminAuditEvent>  $events
     * @return array<string, mixed>
     */
    public function collection(CursorPaginator $events): array
    {
        $skippedCount = 0;
        $mappedEvents = collect($events->items())
            ->map(function (mixed $event) use (&$skippedCount): ?array {
                try {
                    return $this->event($this->auditEvent($event));
                } catch (\Throwable $e) {
                    $skippedCount++;
                    \Illuminate\Support\Facades\Log::warning('[AUDIT_PRESENT_FAILED]', [
                        'event_id' => $event instanceof AdminAuditEvent ? $event->event_id : null,
                        'exception' => $e->getMessage(),
                    ]);
                    return null;
                }
            })
            ->filter()
            ->values()
            ->all();

        $pagination = [
            'per_page' => $events->perPage(),
            'next_cursor' => $events->nextCursor()?->encode(),
            'previous_cursor' => $events->previousCursor()?->encode(),
            'has_more' => $events->hasMorePages(),
        ];

        if ($skippedCount > 0) {
            $pagination['skipped_events'] = $skippedCount;
        }

        return [
            'events' => $mappedEvents,
            'pagination' => $pagination,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function event(AdminAuditEvent $event): array
    {
        $context = $event->context;
        if (! is_array($context)) {
            $context = [];
        } else {
            $encoded = json_encode($context, JSON_INVALID_UTF8_SUBSTITUTE);
            if (is_string($encoded)) {
                $context = json_decode($encoded, true) ?? [];
            }
        }

        return [
            'event_id' => $event->event_id,
            'action' => $event->action,
            'outcome' => $event->outcome,
            'taxonomy' => $event->taxonomy,
            'actor' => [
                'subject_id' => $event->admin_subject_id,
                'email' => $event->admin_email,
                'role' => $event->admin_role,
            ],
            'request' => [
                'method' => $event->method,
                'path' => $event->path,
                'ip_address' => $event->ip_address,
            ],
            'reason' => $event->reason,
            'context' => $this->redact($context),
            'hash_chain' => [
                'previous_hash' => $event->previous_hash,
                'event_hash' => $event->event_hash,
            ],
            'occurred_at' => $this->timestamp($event->occurred_at),
        ];
    }

    private function auditEvent(mixed $event): AdminAuditEvent
    {
        if (! $event instanceof AdminAuditEvent) {
            throw new \UnexpectedValueException('Audit trail paginator returned an invalid event.');
        }

        return $event;
    }

    private function timestamp(mixed $value): ?string
    {
        return $value instanceof Carbon ? $value->toIso8601String() : null;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function redact(array $context): array
    {
        $safe = [];

        foreach ($context as $key => $value) {
            $safe[$key] = $this->isSensitive($key) ? '[redacted]' : $this->redactValue($value);
        }

        return $safe;
    }

    private function redactValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        /** @var array<string, mixed> $value */
        return $this->redact($value);
    }

    private function isSensitive(string|int $key): bool
    {
        if (is_int($key)) {
            return false;
        }

        $normalized = strtolower($key);

        foreach (['token', 'secret', 'password', 'authorization', 'bearer', 'hash'] as $needle) {
            if (str_contains($normalized, $needle)) {
                return true;
            }
        }

        return false;
    }
}
