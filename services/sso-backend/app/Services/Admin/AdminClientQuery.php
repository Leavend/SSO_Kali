<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\OidcClientRegistration;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Collection;

final class AdminClientQuery
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AdminClientPresenter $presenter,
    ) {}

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function clients(): Collection
    {
        return collect($this->clients->ids())
            ->map(fn (string $clientId) => $this->clients->find($clientId))
            ->filter()
            ->map(fn ($client): array => $this->presenter->downstream($client))
            ->values();
    }

    public function registration(string $clientId): ?OidcClientRegistration
    {
        return OidcClientRegistration::query()->where('client_id', $clientId)->first();
    }
}
