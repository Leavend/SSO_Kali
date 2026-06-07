<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\User;
use App\Services\Security\LoginContextRecorder;

final class UserProfileSynchronizer
{
    public function __construct(
        private readonly LoginContextRecorder $recorder
    ) {}

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $context
     */
    public function sync(array $claims, array $context): User
    {
        $subjectId = (string) $claims['sub'];
        $email = (string) ($claims['email'] ?? 'unknown@example.com');

        $user = User::query()->updateOrCreate(
            ['subject_id' => $subjectId],
            [
                'subject_id' => $subjectId,
                'subject_uuid' => $subjectId,
                'email' => $email,
                'given_name' => $claims['given_name'] ?? null,
                'family_name' => $claims['family_name'] ?? null,
                'display_name' => (string) ($claims['name'] ?? $email),
                'role' => $this->resolveRole($email),
                'email_verified_at' => ($claims['email_verified'] ?? false) ? now() : null,
                'last_login_at' => now(),
            ]
        );

        $amr = is_array($context['amr'] ?? null) ? $context['amr'] : [];
        $acr = is_string($context['acr'] ?? null) ? $context['acr'] : null;
        $authTime = $context['auth_time'] ?? null;

        $this->recorder->record(
            $user,
            $context['ip_address'] ?? null,
            $context['user_agent'] ?? $context['device_fingerprint'] ?? null,
            $amr,
            $acr,
            $authTime
        );

        return $user->refresh();
    }

    private function resolveRole(string $email): string
    {
        /** @var list<string> $adminEmails */
        $adminEmails = config('sso.admin_emails', []);

        return in_array($email, $adminEmails, true) ? 'admin' : 'user';
    }
}
