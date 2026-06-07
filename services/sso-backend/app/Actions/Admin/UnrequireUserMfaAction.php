<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Illuminate\Http\Request;

final class UnrequireUserMfaAction
{
    public function __construct(private readonly AdminAuditLogger $audits) {}

    public function execute(User $target, User $admin, Request $request, string $reason): User
    {
        if ($admin->subject_id === $target->subject_id) {
            throw new \RuntimeException('Administrators cannot waive MFA on their own account.');
        }

        $target->forceFill([
            'mfa_mandatory' => false,
        ])->save();

        $this->audits->succeeded(
            'unrequire_user_mfa',
            $request,
            $admin,
            [
                'target_subject_id' => $target->subject_id,
                'reason' => $reason,
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return $target->refresh();
    }
}
