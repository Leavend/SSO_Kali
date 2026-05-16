<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Notifications\PasswordChangedNotification;
use App\Services\Admin\AdminAuditEventStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class ConfirmPasswordResetAction
{
    public function __construct(
        private readonly RevokePasswordResetSessionsAction $revokeSessions,
        private readonly AdminAuditEventStore $audits,
    ) {}

    /**
     * @throws ValidationException
     */
    public function execute(Request $request, string $email, string $token, string $password): void
    {
        $user = $this->validatedUser($email, $token);
        $changedAt = now();

        $user->forceFill([
            'password' => Hash::make($password),
            'password_changed_at' => $changedAt,
            'password_reset_token_hash' => null,
            'password_reset_token_expires_at' => null,
        ])->save();

        $this->revokeSessions->execute($user);
        $this->audit($request, $user);
        $user->notify(new PasswordChangedNotification($changedAt));
    }

    /**
     * @throws ValidationException
     */
    private function validatedUser(string $email, string $token): User
    {
        $user = User::query()->where('email', mb_strtolower(trim($email)))->first();

        if (! $user instanceof User || ! $this->tokenMatches($user, $token)) {
            throw ValidationException::withMessages(['token' => ['Token reset tidak valid atau kedaluwarsa.']]);
        }

        return $user;
    }

    private function tokenMatches(User $user, string $token): bool
    {
        $hash = $user->password_reset_token_hash;
        $expiresAt = $user->password_reset_token_expires_at;

        return is_string($hash) && $hash !== '' && $expiresAt !== null && $expiresAt->isFuture() && Hash::check($token, $hash);
    }

    private function audit(Request $request, User $user): void
    {
        $this->audits->append([
            'taxonomy' => 'profile.password_reset',
            'action' => 'profile.password.reset',
            'outcome' => 'success',
            'admin_subject_id' => $user->subject_id,
            'admin_email' => null,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_password_reset',
            'context' => ['request_id' => $request->headers->get('X-Request-Id')],
        ]);
    }
}
