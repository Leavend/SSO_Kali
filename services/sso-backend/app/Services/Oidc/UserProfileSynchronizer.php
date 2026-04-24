<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class UserProfileSynchronizer
{
    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $context
     */
    public function sync(array $claims, array $context): User
    {
        $subjectId = (string) $claims['sub'];
        $user = User::query()->updateOrCreate(
            ['subject_id' => $subjectId],
            [...$this->identityAttributes($subjectId), ...$this->userAttributes($claims)],
        );

        $this->updateLoginContext($subjectId, $context);

        return $user->refresh();
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function userAttributes(array $claims): array
    {
        $email = (string) ($claims['email'] ?? 'unknown@example.com');

        return [
            'email' => $email,
            'given_name' => $claims['given_name'] ?? null,
            'family_name' => $claims['family_name'] ?? null,
            'display_name' => (string) ($claims['name'] ?? $email),
            'role' => $this->resolveRole($email),
            'email_verified_at' => ($claims['email_verified'] ?? false) ? now() : null,
            'last_login_at' => now(),
        ];
    }

    private function resolveRole(string $email): string
    {
        /** @var list<string> $adminEmails */
        $adminEmails = config('sso.admin_emails', []);

        return in_array($email, $adminEmails, true) ? 'admin' : 'user';
    }

    /**
     * @return array<string, string>
     */
    private function identityAttributes(string $subjectId): array
    {
        return [
            'subject_id' => $subjectId,
            'subject_uuid' => $subjectId,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function updateLoginContext(string $subjectId, array $context): void
    {
        $existing = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();

        $riskScore = $this->riskScore($existing, $context);
        $fingerprint = $this->fingerprint($context);

        DB::table('login_contexts')->updateOrInsert(
            ['subject_id' => $subjectId],
            [
                'subject_uuid' => $subjectId,
                'ip_address' => $context['ip_address'],
                'device_fingerprint' => $fingerprint,
                'risk_score' => $riskScore,
                'mfa_required' => $riskScore >= 60,
                'auth_time' => $this->authTime($context),
                'amr' => $this->encodedAmr($context),
                'acr' => $this->acr($context),
                'last_seen_at' => now(),
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function riskScore(?object $existing, array $context): int
    {
        if ($existing === null) {
            return 40;
        }

        $ipChanged = ($existing->ip_address ?? null) !== ($context['ip_address'] ?? null);
        $deviceChanged = ($existing->device_fingerprint ?? null) !== $this->fingerprint($context);

        return $ipChanged || $deviceChanged ? 80 : 15;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function fingerprint(array $context): string
    {
        $value = (string) ($context['device_fingerprint'] ?? $context['user_agent'] ?? 'unknown-device');

        return hash('sha256', $value);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function authTime(array $context): ?CarbonImmutable
    {
        $authTime = $context['auth_time'] ?? null;

        if (is_int($authTime)) {
            return CarbonImmutable::createFromTimestamp($authTime);
        }

        return is_string($authTime) && ctype_digit($authTime)
            ? CarbonImmutable::createFromTimestamp((int) $authTime)
            : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function acr(array $context): ?string
    {
        $acr = $context['acr'] ?? null;

        return is_string($acr) && $acr !== '' ? $acr : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function encodedAmr(array $context): ?string
    {
        $amr = array_values(array_filter(
            is_array($context['amr'] ?? null) ? $context['amr'] : [],
            static fn (mixed $value): bool => is_string($value) && $value !== '',
        ));

        return $amr === [] ? null : json_encode($amr, JSON_THROW_ON_ERROR);
    }
}
