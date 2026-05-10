<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AuthenticationAuditEvent;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Support\Carbon;
use UnexpectedValueException;

final class AdminAuthenticationAuditPresenter
{
    /**
     * @param  CursorPaginator<int, AuthenticationAuditEvent>  $events
     * @return array<string, mixed>
     */
    public function collection(CursorPaginator $events): array
    {
        return [
            'events' => collect($events->items())
                ->map(fn (mixed $event): array => $this->event($this->auditEvent($event)))
                ->values()
                ->all(),
            'pagination' => [
                'per_page' => $events->perPage(),
                'next_cursor' => $events->nextCursor()?->encode(),
                'previous_cursor' => $events->previousCursor()?->encode(),
                'has_more' => $events->hasMorePages(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function event(AuthenticationAuditEvent $event): array
    {
        return [
            'event_id' => $event->event_id,
            'event_type' => $event->event_type,
            'outcome' => $event->outcome,
            'subject' => [
                'subject_id' => $event->subject_id,
                'email' => $event->email,
            ],
            'client_id' => $event->client_id,
            'session_id' => $event->session_id,
            'request' => [
                'ip_address' => $event->ip_address,
                'user_agent' => $event->user_agent,
                'request_id' => $event->request_id,
            ],
            'error_code' => $event->error_code,
            'context' => $this->redact($event->context ?? []),
            'occurred_at' => $this->timestamp($event->occurred_at),
        ];
    }

    private function auditEvent(mixed $event): AuthenticationAuditEvent
    {
        if (! $event instanceof AuthenticationAuditEvent) {
            throw new UnexpectedValueException('Authentication audit paginator returned an invalid event.');
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

    private function isSensitive(string $key): bool
    {
        $normalized = strtolower($key);

        foreach (['authorization', 'bearer', 'cookie', 'password', 'secret', 'token'] as $needle) {
            if (str_contains($normalized, $needle)) {
                return true;
            }
        }

        return false;
    }
}
