<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\Admin\AdminAuditEventStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

/**
 * FR-015 / UC-37: Admin reset user password.
 *
 * Sets a new password for a managed user and forces change on next login
 * by clearing password_changed_at.
 */
final class ResetUserPasswordAction
{
    public function __construct(
        private readonly AdminAuditEventStore $audits,
    ) {}

    /**
     * @return array{user_id: string, email: string, force_change: bool}
     */
    public function execute(Request $request, User $admin, string $userId, string $newPassword): array
    {
        $user = User::query()->where('subject_id', $userId)->first();

        if (! $user instanceof User) {
            throw new RuntimeException('User not found.');
        }

        // Validate password strength
        $validator = Validator::make(['password' => $newPassword], [
            'password' => ['required', 'string', new StrongPassword],
        ]);

        if ($validator->fails()) {
            throw new RuntimeException($validator->errors()->first('password') ?? 'Password tidak memenuhi kebijakan.');
        }

        $user->update([
            'password' => Hash::make($newPassword),
            'password_changed_at' => null, // Force change on next login
        ]);

        $this->audit($request, $admin, $user);

        return [
            'user_id' => $user->subject_id,
            'email' => $user->email,
            'force_change' => true,
        ];
    }

    private function audit(Request $request, User $admin, User $target): void
    {
        $this->audits->append([
            'taxonomy' => 'admin.user.password_reset',
            'action' => 'admin.user.reset_password',
            'outcome' => 'success',
            'admin_subject_id' => $admin->subject_id,
            'admin_email' => $admin->email,
            'admin_role' => $admin->role,
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'admin_password_reset',
            'context' => [
                'target_user_id' => $target->subject_id,
                'target_email' => $target->email,
                'force_change' => true,
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
        ]);
    }
}
