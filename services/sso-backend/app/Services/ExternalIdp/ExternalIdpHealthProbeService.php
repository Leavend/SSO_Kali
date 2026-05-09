<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use Illuminate\Support\Facades\Http;
use Throwable;

final class ExternalIdpHealthProbeService
{
    /**
     * @return array{provider_key: string, enabled: bool, healthy: bool, status: string, latency_ms: float|null, checked_at: string, error: string|null}
     */
    public function probe(ExternalIdentityProvider $provider): array
    {
        if (! $provider->enabled) {
            return $this->mark($provider, false, 'disabled', null, null);
        }

        $started = microtime(true);

        try {
            $response = Http::acceptJson()
                ->timeout($this->timeoutSeconds())
                ->get($provider->metadata_url);
            $latencyMs = round((microtime(true) - $started) * 1000, 2);
            $document = $response->json();
            $healthy = $response->successful() && $this->validDiscovery($provider, $document);

            return $this->mark(
                $provider,
                $healthy,
                $healthy ? 'healthy' : 'unhealthy',
                $latencyMs,
                $healthy ? null : 'External IdP discovery health probe failed validation.',
            );
        } catch (Throwable $exception) {
            return $this->mark(
                $provider,
                false,
                'unhealthy',
                round((microtime(true) - $started) * 1000, 2),
                $exception->getMessage(),
            );
        }
    }

    /**
     * @return array{required_ready: bool, any_ready: bool, total_enabled: int, healthy: int, unhealthy: int, unknown: int, providers: list<array{provider_key: string, is_backup: bool, priority: int, health_status: string, last_health_checked_at: string|null}>}
     */
    public function readinessSummary(): array
    {
        $providers = ExternalIdentityProvider::query()
            ->where('enabled', true)
            ->orderBy('is_backup')
            ->orderBy('priority')
            ->orderBy('provider_key')
            ->get();
        $summaries = $providers->map(fn (ExternalIdentityProvider $provider): array => [
            'provider_key' => $provider->provider_key,
            'is_backup' => $provider->is_backup,
            'priority' => $provider->priority,
            'health_status' => $provider->health_status,
            'last_health_checked_at' => $provider->last_health_checked_at?->toISOString(),
        ])->values()->all();
        $healthyCount = $providers->where('health_status', 'healthy')->count();
        $unknownCount = $providers->where('health_status', 'unknown')->count();
        $unhealthyCount = $providers->where('health_status', 'unhealthy')->count();

        return [
            'required_ready' => $providers->isEmpty() || $healthyCount + $unknownCount > 0,
            'any_ready' => $healthyCount + $unknownCount > 0,
            'total_enabled' => $providers->count(),
            'healthy' => $healthyCount,
            'unhealthy' => $unhealthyCount,
            'unknown' => $unknownCount,
            'providers' => $summaries,
        ];
    }

    /**
     * @return array{provider_key: string, enabled: bool, healthy: bool, status: string, latency_ms: float|null, checked_at: string, error: string|null}
     */
    private function mark(
        ExternalIdentityProvider $provider,
        bool $healthy,
        string $status,
        ?float $latencyMs,
        ?string $error,
    ): array {
        $provider->forceFill([
            'health_status' => $status,
            'last_health_checked_at' => now(),
        ])->save();

        return [
            'provider_key' => $provider->provider_key,
            'enabled' => $provider->enabled,
            'healthy' => $healthy,
            'status' => $status,
            'latency_ms' => $latencyMs,
            'checked_at' => now()->toISOString(),
            'error' => $error,
        ];
    }

    private function timeoutSeconds(): int
    {
        return max(1, (int) config('sso.external_idp.health_timeout_seconds', 3));
    }

    private function validDiscovery(ExternalIdentityProvider $provider, mixed $document): bool
    {
        return is_array($document)
            && ($document['issuer'] ?? null) === $provider->issuer
            && $this->https($document, 'authorization_endpoint')
            && $this->https($document, 'token_endpoint')
            && $this->https($document, 'userinfo_endpoint')
            && $this->https($document, 'jwks_uri');
    }

    /**
     * @param  array<string, mixed>  $document
     */
    private function https(array $document, string $key): bool
    {
        return is_string($document[$key] ?? null) && str_starts_with($document[$key], 'https://');
    }
}
