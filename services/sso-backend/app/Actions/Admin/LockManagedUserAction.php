<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

final class LockManagedUserAction
{
    public function __construct(private readonly AdminAuditLogger $audits) {}

    public function execute(User $target, User $admin, Request $request, string $reason, ?Carbon $until): User
    {
        if ($admin->subject_id === $target->subject_id) {
            throw new \RuntimeException('Administrators cannot lock their own account.');
        }

        $now = now();

        $target->forceFill([
            'locked_at' => $now,
            'locked_until' => $until,
            'locked_reason' => $reason,
            'locked_by_subject_id' => $admin->subject_id,
            'lock_count' => (int) $target->lock_count + 1,
        ])->save();

        $this->audits->succeeded(
            'lock_managed_user',
            $request,
            $admin,
            [
                'target_subject_id' => $target->subject_id,
                'lock_count' => $target->lock_count,
                'locked_until' => $until?->toIso8601String(),
                'reason' => $reason,
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $target->refresh();
    }
}
