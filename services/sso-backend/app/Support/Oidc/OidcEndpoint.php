<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class OidcEndpoint
{
    public function __construct(
        public string $name,
        public string $method,
        public string $path,
        public string $description,
    ) {}

    /**
     * @return array<string, string>
     */
    public function toArray(): array
    {
        return [
            'endpoint' => $this->name,
            'method' => $this->method,
            'path' => $this->path,
            'description' => $this->description,
        ];
    }
}
