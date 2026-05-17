<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Repositories\DataSubjectRequestRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class DataSubjectRequestService
{
    public const TYPE_EXPORT = 'export';

    public const TYPE_DELETE = 'delete';

    public const TYPE_ANONYMIZE = 'anonymize';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_FULFILLED = 'fulfilled';

    public const STATUS_ON_HOLD = 'on_hold';

    public const SLA_HOURS = 720; // 30 days regulatory baseline

    public function __construct(private readonly DataSubjectRequestRepository $requests) {}

    /**
     * @return Collection<int, DataSubjectRequest>
     */
    public function listForSubject(string $subjectId, int $limit = 50): Collection
    {
        return $this->requests->listForSubject($subjectId, $limit);
    }

    /**
     * @return array<string, mixed>
     */
    public function present(DataSubjectRequest $dsr): array
    {
        return [
            'request_id' => $dsr->request_id,
            'type' => $dsr->type,
            'status' => $dsr->status,
            'reason' => $dsr->reason,
            'submitted_at' => $dsr->submitted_at->toIso8601String(),
            'reviewed_at' => $dsr->reviewed_at?->toIso8601String(),
            'fulfilled_at' => $dsr->fulfilled_at?->toIso8601String(),
            'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
        ];
    }

    /**
     * @param  array<string,mixed>  $filters
     */
    public function listing(array $filters): Builder
    {
        return $this->requests->listing($filters);
    }
}
