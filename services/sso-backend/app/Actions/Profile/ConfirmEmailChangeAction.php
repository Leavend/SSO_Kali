<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\ProfileChangeRequest;
use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Profile\ProfileChangeTokenService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class ConfirmEmailChangeAction
{
    public function __construct(
        private readonly ProfileChangeTokenService $tokens,
        private readonly AdminAuditEventStore $audits,
    ) {}

    /** @return array<string, mixed> */
    public function execute(Request $request, string $token): array
    {
        $change = $this->validChange($token);
        /** @var User $user */
        $user = $change->user()->firstOrFail();
        $oldEmail = $user->email;
        $changedAt = now();

        $user->forceFill(['email' => $change->target_value, 'email_verified_at' => null, 'profile_synced_at' => $changedAt])->save();
        $change->forceFill(['consumed_at' => $changedAt])->save();
        $this->audit($request, $user, $oldEmail, $change->target_value);
        $user->notify(new EmailChangedNotification($change->target_value, $changedAt));

        return ['email' => $change->target_value, 'changed_at' => $changedAt->toIso8601String()];
    }

    /** @throws ValidationException */
    private function validChange(string $token): ProfileChangeRequest
    {
        $changes = ProfileChangeRequest::query()
            ->where('type', ProfileChangeRequest::TYPE_EMAIL)
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->limit(25)
            ->get();

        foreach ($changes as $change) {
            if ($this->tokens->matches($change->token_hash, $token)) {
                return $change;
            }
        }

        throw ValidationException::withMessages(['token' => ['Token perubahan email tidak valid atau kedaluwarsa.']]);
    }

    private function audit(Request $request, User $user, string $oldEmail, string $newEmail): void
    {
        $this->audits->append([
            'taxonomy' => 'profile.email_changed',
            'action' => 'profile.email_changed',
            'outcome' => 'success',
            'admin_subject_id' => $user->subject_id,
            'admin_email' => $oldEmail,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_email_change',
            'context' => ['old_email_hash' => hash('sha256', $oldEmail), 'new_email_hash' => hash('sha256', $newEmail)],
        ]);
    }
}
