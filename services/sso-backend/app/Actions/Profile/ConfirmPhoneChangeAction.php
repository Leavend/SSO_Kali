<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\ProfileChangeRequest;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Profile\ProfileChangePrincipal;
use App\Services\Profile\ProfileChangeTokenService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class ConfirmPhoneChangeAction
{
    public function __construct(
        private readonly ProfileChangePrincipal $principals,
        private readonly ProfileChangeTokenService $tokens,
        private readonly AdminAuditLogger $audit,
    ) {}

    /** @return array<string, mixed> */
    public function execute(Request $request, string $otp): array
    {
        $user = $this->principals->resolve($request)['user'];
        $change = $this->validChange($user->id, $otp);
        $changedAt = now();
        $user->forceFill(['phone' => $change->target_value, 'phone_verified_at' => $changedAt, 'profile_synced_at' => $changedAt])->save();
        $change->forceFill(['consumed_at' => $changedAt])->save();
        $this->audit->succeeded('profile.phone_changed', $request, $user, [
            'target_hash' => hash('sha256', $change->target_value),
        ], AdminAuditTaxonomy::PROFILE_SELF_UPDATE);

        return ['phone' => $change->target_value, 'changed_at' => $changedAt->toIso8601String()];
    }

    /** @throws ValidationException */
    private function validChange(int $userId, string $otp): ProfileChangeRequest
    {
        $changes = ProfileChangeRequest::query()
            ->where('user_id', $userId)
            ->where('type', ProfileChangeRequest::TYPE_PHONE)
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->limit(5)
            ->get();

        foreach ($changes as $change) {
            if ($this->tokens->matches($change->otp_hash, $otp)) {
                return $change;
            }
        }

        throw ValidationException::withMessages(['otp' => ['Kode OTP tidak valid atau kedaluwarsa.']]);
    }
}
