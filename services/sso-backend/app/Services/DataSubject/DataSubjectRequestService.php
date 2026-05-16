<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

final class DataSubjectRequestService
{
    public const TYPE_EXPORT = 'export';

    public const TYPE_DELETE = 'delete';

    public const TYPE_ANONYMIZE = 'anonymize';

    public const STATUS_SUBMITTED = 'submitted';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_FULFILLED = 'fulfilled';

    public const SLA_HOURS = 720; // 30 days regulatory baseline

    public function __construct(
        private readonly AdminAuditLogger $audit,
        private readonly DataSubjectExportBuilder $exportBuilder,
    ) {}

    public function submit(User $subject, string $type, ?string $reason, Request $request): DataSubjectRequest
    {
        if (! in_array($type, DataSubjectRequest::TYPES, true)) {
            throw new RuntimeException('Unsupported data subject request type.');
        }

        $now = now();

        $dsr = DataSubjectRequest::query()->create([
            'request_id' => (string) Str::ulid(),
            'subject_id' => $subject->subject_id,
            'type' => $type,
            'status' => self::STATUS_SUBMITTED,
            'reason' => $reason,
            'context' => [
                'request_id' => $request->headers->get('X-Request-Id'),
                'submitted_via' => 'self_service',
            ],
            'submitted_at' => $now,
            'sla_due_at' => $now->copy()->addHours(self::SLA_HOURS),
        ]);

        $this->audit->succeeded(
            'submit_data_subject_request',
            $request,
            $subject,
            [
                'request_id' => $dsr->request_id,
                'type' => $type,
                'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
            ],
            AdminAuditTaxonomy::PROFILE_SELF_UPDATE,
        );

        return $dsr;
    }

    public function review(DataSubjectRequest $dsr, User $reviewer, string $decision, ?string $notes, Request $request): DataSubjectRequest
    {
        if (! in_array($decision, [self::STATUS_APPROVED, self::STATUS_REJECTED], true)) {
            throw new RuntimeException('Unsupported DSR review decision.');
        }
        if ($dsr->status !== self::STATUS_SUBMITTED) {
            throw new RuntimeException('DSR is not in a reviewable state.');
        }

        $dsr->forceFill([
            'status' => $decision,
            'reviewer_subject_id' => $reviewer->subject_id,
            'reviewer_notes' => $notes,
            'reviewed_at' => now(),
        ])->save();

        $this->audit->succeeded(
            'review_data_subject_request',
            $request,
            $reviewer,
            [
                'request_id' => $dsr->request_id,
                'type' => $dsr->type,
                'decision' => $decision,
                'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
            ],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $dsr->refresh();
    }

    /**
     * @return array<string, mixed>
     */
    public function fulfill(DataSubjectRequest $dsr, User $reviewer, Request $request, bool $dryRun = false): array
    {
        if ($dsr->status !== self::STATUS_APPROVED) {
            throw new RuntimeException('DSR must be approved before fulfilment.');
        }

        $artifact = match ($dsr->type) {
            self::TYPE_EXPORT => $this->exportBuilder->build($dsr->subject_id),
            self::TYPE_DELETE => ['summary' => 'Subject account scheduled for deletion.', 'dry_run' => $dryRun],
            self::TYPE_ANONYMIZE => ['summary' => 'Subject account scheduled for anonymization.', 'dry_run' => $dryRun],
            default => throw new RuntimeException('Unsupported DSR type.'),
        };

        if (! $dryRun) {
            $dsr->forceFill([
                'status' => self::STATUS_FULFILLED,
                'fulfilled_at' => now(),
                'expires_at' => now()->addDays(7),
            ])->save();
        }

        $this->audit->succeeded(
            'fulfill_data_subject_request',
            $request,
            $reviewer,
            [
                'request_id' => $dsr->request_id,
                'type' => $dsr->type,
                'dry_run' => $dryRun,
                'sla_due_at' => $dsr->sla_due_at?->toIso8601String(),
            ],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return [
            'request' => $dsr->fresh()?->toArray() ?? $dsr->toArray(),
            'artifact' => $artifact,
            'dry_run' => $dryRun,
        ];
    }

    /**
     * @param  array<string,mixed>  $filters
     */
    public function listing(array $filters): Builder
    {
        $query = DataSubjectRequest::query()->orderByDesc('id');

        foreach (['status', 'type', 'subject_id'] as $field) {
            if (is_string($filters[$field] ?? null) && $filters[$field] !== '') {
                $query->where($field, $filters[$field]);
            }
        }

        return $query;
    }
}
