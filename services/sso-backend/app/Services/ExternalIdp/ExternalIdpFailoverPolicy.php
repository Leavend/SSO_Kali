<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use Illuminate\Database\Eloquent\Collection;
use RuntimeException;

final class ExternalIdpFailoverPolicy
{
    /**
     * @return array{provider: ExternalIdentityProvider, mode: string, candidates: list<array<string, mixed>>}
     */
    public function select(?string $preferredProviderKey = null): array
    {
        $providers = $this->eligibleProviders();
        $candidates = $this->candidateSummary($providers);

        if ($preferredProviderKey !== null && $preferredProviderKey !== '') {
            $preferred = $providers->first(
                fn (ExternalIdentityProvider $provider): bool => $provider->provider_key === $preferredProviderKey,
            );

            if ($preferred instanceof ExternalIdentityProvider) {
                return [
                    'provider' => $preferred,
                    'mode' => $preferred->is_backup ? 'preferred_backup' : 'preferred_primary',
                    'candidates' => $candidates,
                ];
            }
        }

        $primary = $providers->first(fn (ExternalIdentityProvider $provider): bool => ! $provider->is_backup);

        if ($primary instanceof ExternalIdentityProvider) {
            return [
                'provider' => $primary,
                'mode' => 'primary',
                'candidates' => $candidates,
            ];
        }

        $backup = $providers->first(fn (ExternalIdentityProvider $provider): bool => $provider->is_backup);

        if ($backup instanceof ExternalIdentityProvider) {
            return [
                'provider' => $backup,
                'mode' => 'backup_failover',
                'candidates' => $candidates,
            ];
        }

        throw new RuntimeException('No healthy external IdP provider is available.');
    }

    /**
     * @return Collection<int, ExternalIdentityProvider>
     */
    private function eligibleProviders(): Collection
    {
        return ExternalIdentityProvider::query()
            ->where('enabled', true)
            ->whereIn('health_status', ['healthy', 'unknown'])
            ->whereNull('breaker_tripped_at')
            ->orderBy('is_backup')
            ->orderBy('priority')
            ->orderBy('provider_key')
            ->get();
    }

    /**
     * @param  Collection<int, ExternalIdentityProvider>  $providers
     * @return list<array<string, mixed>>
     */
    private function candidateSummary(Collection $providers): array
    {
        return $providers
            ->map(fn (ExternalIdentityProvider $provider): array => [
                'provider_key' => $provider->provider_key,
                'is_backup' => $provider->is_backup,
                'priority' => $provider->priority,
                'health_status' => $provider->health_status,
            ])
            ->values()
            ->all();
    }
}
