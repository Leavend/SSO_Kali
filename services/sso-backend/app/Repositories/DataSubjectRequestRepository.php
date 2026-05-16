<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Models\DataSubjectRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class DataSubjectRequestRepository
{
    /**
     * @return Collection<int, DataSubjectRequest>
     */
    public function listForSubject(string $subjectId, int $limit = 50): Collection
    {
        return $this->listing(['subject_id' => $subjectId])
            ->limit($limit)
            ->get();
    }

    public function findByRequestId(string $requestId): ?DataSubjectRequest
    {
        $request = DataSubjectRequest::query()
            ->where('request_id', $requestId)
            ->first();

        return $request instanceof DataSubjectRequest ? $request : null;
    }

    /**
     * @param  array<string,mixed>  $filters
     * @return Builder<DataSubjectRequest>
     */
    public function listing(array $filters): Builder
    {
        $query = DataSubjectRequest::query()
            ->select($this->columns())
            ->orderByDesc('id');

        foreach (['status', 'type', 'subject_id'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $query->where($field, $filters[$field]);
            }
        }

        return $query;
    }

    /**
     * @return list<string>
     */
    private function columns(): array
    {
        return [
            'id',
            'request_id',
            'subject_id',
            'type',
            'status',
            'reason',
            'context',
            'reviewer_subject_id',
            'reviewer_notes',
            'submitted_at',
            'reviewed_at',
            'fulfilled_at',
            'sla_due_at',
            'expires_at',
        ];
    }
}
