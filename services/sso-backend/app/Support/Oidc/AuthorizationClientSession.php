<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class AuthorizationClientSession
{
    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $browserContext
     */
    public function __construct(
        public DownstreamClient $client,
        public array $context,
        public array $browserContext,
    ) {}
}
