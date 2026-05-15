<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class TokenClientCredentials
{
    public function __construct(
        public string $clientId,
        public ?string $clientSecret,
        public string $authMethod,
    ) {}
}
