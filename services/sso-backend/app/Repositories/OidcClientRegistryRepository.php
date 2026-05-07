<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\DownstreamClient;

final class OidcClientRegistryRepository
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
    ) {}

    /**
     * @return list<DownstreamClient>
     */
    public function all(): array
    {
        return array_values(array_filter(
            array_map(fn (string $clientId): ?DownstreamClient => $this->clients->find($clientId), $this->clients->ids()),
            static fn (?DownstreamClient $client): bool => $client instanceof DownstreamClient,
        ));
    }

    public function assertConfidentialSecretsCompliant(): int
    {
        return $this->clients->assertStoredSecretsCompliant();
    }
}
