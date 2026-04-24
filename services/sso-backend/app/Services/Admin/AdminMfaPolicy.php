<?php

declare(strict_types=1);

namespace App\Services\Admin;

final class AdminMfaPolicy
{
    public function enabled(): bool
    {
        return (bool) config('sso.admin.mfa.enforced', false);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function required(array $context): bool
    {
        return $this->enabled() && ! $this->verified($context);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function verified(array $context): bool
    {
        return array_intersect($this->acceptedAmr(), $this->amr($context)) !== [];
    }

    /**
     * @return list<string>
     */
    public function acceptedAmr(): array
    {
        $configured = config('sso.admin.mfa.accepted_amr', ['mfa']);

        return is_array($configured)
            ? array_values(array_filter($configured, static fn (mixed $value): bool => is_string($value) && $value !== ''))
            : ['mfa'];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return list<string>
     */
    private function amr(array $context): array
    {
        $amr = $context['amr'] ?? [];

        return is_array($amr)
            ? array_values(array_filter($amr, static fn (mixed $value): bool => is_string($value) && $value !== ''))
            : [];
    }
}
