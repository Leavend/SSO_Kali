<?php

declare(strict_types=1);

namespace App\Services\Identity;

final readonly class ResolvedIdentifier
{
    public function __construct(
        public IdentifierType $type,
        public string $normalized,
    ) {}

    public function loginHint(): string
    {
        return $this->normalized;
    }
}
