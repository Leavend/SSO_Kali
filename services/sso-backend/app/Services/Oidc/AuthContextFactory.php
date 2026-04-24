<?php

declare(strict_types=1);

namespace App\Services\Oidc;

final class AuthContextFactory
{
    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    public function fromUpstreamClaims(array $claims): array
    {
        return $this->normalized($claims, true);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    public function fromLocalClaims(array $claims): array
    {
        return $this->normalized($claims, false);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    public function authTime(array $claims, bool $fallbackToIssuedAt = false): ?int
    {
        return $this->timestamp($claims['auth_time'] ?? null)
            ?? ($fallbackToIssuedAt ? $this->timestamp($claims['iat'] ?? null) : null);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function normalized(array $claims, bool $fallbackToIssuedAt): array
    {
        return array_filter([
            'auth_time' => $this->authTime($claims, $fallbackToIssuedAt),
            'amr' => $this->amr($claims['amr'] ?? null),
            'acr' => $this->acr($claims),
        ], static fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * @return list<string>
     */
    private function amr(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn (mixed $item): bool => is_string($item) && $item !== ''));
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function acr(array $claims): ?string
    {
        $acr = $claims['acr'] ?? null;

        return is_string($acr) && $acr !== '' ? $acr : null;
    }

    private function timestamp(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        return is_string($value) && ctype_digit($value) ? (int) $value : null;
    }
}
