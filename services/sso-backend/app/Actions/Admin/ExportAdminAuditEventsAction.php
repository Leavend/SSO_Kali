<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\AdminAuditEvent;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminAuditTrailPresenter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ExportAdminAuditEventsAction
{
    public const MAX_ROWS = 50_000;

    public const ALLOWED_FORMATS = ['csv', 'jsonl'];

    public const FIELD_WHITELIST = [
        'event_id',
        'action',
        'outcome',
        'taxonomy',
        'admin_subject_id',
        'admin_email',
        'admin_role',
        'method',
        'path',
        'ip_address',
        'reason',
        'occurred_at',
        'previous_hash',
        'event_hash',
        'signing_key_id',
    ];

    public function __construct(
        private readonly AdminAuditTrailPresenter $presenter,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array{format:string, from?:?string, to?:?string, action?:?string, outcome?:?string, taxonomy?:?string, admin_subject_id?:?string}  $filters
     */
    public function execute(Request $request, array $filters): StreamedResponse
    {
        $admin = $request->attributes->get('admin_user');
        $format = $filters['format'];

        if (! in_array($format, self::ALLOWED_FORMATS, true)) {
            return response()->stream(static fn () => null, Response::HTTP_BAD_REQUEST, [
                'Content-Type' => 'application/json',
            ]);
        }

        $query = $this->scopedQuery($filters)->limit(self::MAX_ROWS + 1);
        $rows = $query->get();
        $exceeded = $rows->count() > self::MAX_ROWS;
        if ($exceeded) {
            $rows = $rows->slice(0, self::MAX_ROWS)->values();
        }
        /** @var iterable<int, AdminAuditEvent> $eventRows */
        $eventRows = $rows;

        if ($admin !== null) {
            $this->audit->succeeded(
                'export_admin_audit_events',
                $request,
                $admin,
                [
                    'format' => $format,
                    'row_count' => $rows->count(),
                    'truncated' => $exceeded,
                    'filters' => array_intersect_key($filters, array_flip(['from', 'to', 'action', 'outcome', 'taxonomy', 'admin_subject_id'])),
                    'request_id' => $request->headers->get('X-Request-Id'),
                ],
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );
        }

        return $format === 'csv'
            ? $this->csvResponse($eventRows)
            : $this->jsonlResponse($eventRows);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function scopedQuery(array $filters): Builder
    {
        $query = AdminAuditEvent::query()->orderBy('id');
        foreach (['action', 'outcome', 'taxonomy', 'admin_subject_id'] as $field) {
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

        return $query;
    }

    /**
     * @param  iterable<int, AdminAuditEvent>  $rows
     */
    private function csvResponse(iterable $rows): StreamedResponse
    {
        $callback = function () use ($rows): void {
            $stream = fopen('php://output', 'w');
            if ($stream === false) {
                return;
            }
            fputcsv($stream, self::FIELD_WHITELIST);
            foreach ($rows as $row) {
                fputcsv($stream, array_map(fn (string $field): string => $this->scalar($row, $field), self::FIELD_WHITELIST));
            }
            fclose($stream);
        };

        return response()->stream($callback, Response::HTTP_OK, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="admin-audit-events.csv"',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * @param  iterable<int, AdminAuditEvent>  $rows
     */
    private function jsonlResponse(iterable $rows): StreamedResponse
    {
        $callback = function () use ($rows): void {
            $stream = fopen('php://output', 'w');
            if ($stream === false) {
                return;
            }
            foreach ($rows as $row) {
                $payload = $this->presenter->event($row);
                fwrite($stream, json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)."\n");
            }
            fclose($stream);
        };

        return response()->stream($callback, Response::HTTP_OK, [
            'Content-Type' => 'application/x-ndjson; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="admin-audit-events.jsonl"',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function scalar(AdminAuditEvent $event, string $field): string
    {
        $value = $event->getAttribute($field);
        if ($value === null) {
            return '';
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->format(\DateTimeInterface::ATOM);
        }

        return is_scalar($value) ? (string) $value : (string) json_encode($value, JSON_THROW_ON_ERROR);
    }
}
