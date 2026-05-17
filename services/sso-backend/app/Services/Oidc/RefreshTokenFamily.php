<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use Carbon\CarbonImmutable;

final readonly class RefreshTokenFamily
{
    public function __construct(
        public string $id,
        public ?int $createdAt,
    ) {}

    public static function fromRecord(object $record): self
    {
        return new self(
            id: (string) $record->token_family_id,
            createdAt: self::timestamp($record->family_created_at ?? $record->created_at ?? null),
        );
    }

    public function isExpired(): bool
    {
        if ($this->createdAt === null) {
            return false;
        }

        return CarbonImmutable::createFromTimestamp($this->createdAt)
            ->addDays((int) config('sso.ttl.refresh_token_family_days', 90))
            ->isPast();
    }

    private static function timestamp(mixed $value): ?int
    {
        return $value === null ? null : CarbonImmutable::parse((string) $value)->timestamp;
    }
}
