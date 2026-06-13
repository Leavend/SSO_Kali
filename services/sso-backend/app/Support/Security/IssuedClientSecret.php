<?php

declare(strict_types=1);

namespace App\Support\Security;

use Illuminate\Support\Carbon;

final readonly class IssuedClientSecret
{
    public function __construct(
        public string $plaintext,
        public string $hash,
        public Carbon $issuedAt,
        public Carbon $expiresAt,
    ) {}
}
