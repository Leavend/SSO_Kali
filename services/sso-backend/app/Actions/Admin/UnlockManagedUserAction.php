<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;

final class UnlockManagedUserAction
{
    public function __construct(private readonly AdminAuditLogger $audits) {}

    public function execute(User $target, User $admin, Request $request, ?string $reason = null): User
    {
        if ($target->locked_at === null) {
            return $target;
        }

        $context = [
            'target_subject_id' => $target->subject_id,
            'previous_lock_reason' => $target->locked_reason,
            'previous_lock_until' => $target->locked_until?->toIso8601String(),
            'reason' => $reason,
            'request_id' => $request->headers->get('X-Request-Id'),
        ];

        $target->forceFill([
            'locked_at' => null,
            'locked_until' => null,
            'locked_reason' => null,
            'locked_by_subject_id' => null,
        ])->save();

        $this->audits->succeeded(
            'unlock_managed_user',
            $request,
            $admin,
            $context,
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $target->refresh();
    }
}
