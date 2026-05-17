<?php

declare(strict_types=1);

namespace App\Services\Oidc;

final readonly class RefreshTokenReuseSignal
{
    /** @param array<string, mixed>|null $record */
    public function __construct(
        public ?array $record,
        public bool $reuse,
        public ?string $familyId,
        public ?string $tokenId,
    ) {}

    /** @return array{record: array<string, mixed>|null, reuse: bool, family_id: string|null, token_id: string|null} */
    public function toArray(): array
    {
        return [
            'record' => $this->record,
            'reuse' => $this->reuse,
            'family_id' => $this->familyId,
            'token_id' => $this->tokenId,
        ];
    }
}
