<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\ProfileChangeRequest;
use App\Notifications\EmailChangeRequestedNotification;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Profile\ProfileChangePrincipal;
use App\Services\Profile\ProfileChangeTokenService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class RequestEmailChangeAction
{
    public function __construct(
        private readonly ProfileChangePrincipal $principals,
        private readonly ProfileChangeTokenService $tokens,
        private readonly AdminAuditLogger $audit,
    ) {}

    /** @return array<string, mixed> */
    public function execute(Request $request, string $newEmail, string $currentPassword): array
    {
        $user = $this->principals->resolve($request)['user'];
        $this->assertPassword($user->password, $currentPassword);
        $token = $this->tokens->token();
        $expiresAt = now()->addMinutes($this->tokens->ttlMinutes());
        $change = ProfileChangeRequest::query()->create([
            'user_id' => $user->id,
            'type' => ProfileChangeRequest::TYPE_EMAIL,
            'target_value' => mb_strtolower(trim($newEmail)),
            'token_hash' => $this->tokens->hash($token),
            'expires_at' => $expiresAt,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $user->notify(new EmailChangeRequestedNotification($token, $expiresAt));
        $this->audit->succeeded('profile.email_change_requested', $request, $user, ['change_request_id' => $change->id], AdminAuditTaxonomy::PROFILE_SELF_UPDATE);

        return ['expires_at' => $expiresAt->toIso8601String()];
    }

    /** @throws ValidationException */
    private function assertPassword(?string $hash, string $password): void
    {
        if (! is_string($hash) || ! Hash::check($password, $hash)) {
            throw ValidationException::withMessages(['current_password' => ['Password saat ini salah.']]);
        }
    }
}
