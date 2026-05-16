<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\ExternalIdp\ProbeExternalIdpHealthAction;
use App\Models\ExternalIdentityProvider;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Throwable;

/**
 * BE-FR059-001 — scheduled probe + circuit breaker reconciliation.
 *
 * Iterates every enabled external IdP, runs the health probe (which updates
 * consecutive failure/success counters via {@see ExternalIdpHealthProbeService}),
 * and emits a summary suitable for ops dashboards. The command is wired into
 * the schedule (every 5 minutes) and is also invokable on demand.
 *
 * Each row of the summary intentionally surfaces breaker state so operators
 * can spot flapping providers without having to query the database directly.
 */
final class ProbeExternalIdpHealthCommand extends Command
{
    /** @var string */
    protected $signature = 'sso:external-idp:probe-health {--provider= : Restrict probe to a single provider key}';

    /** @var string */
    protected $description = 'Probe external IdP discovery endpoints and update circuit-breaker counters.';

    public function handle(ProbeExternalIdpHealthAction $action): int
    {
        $providers = $this->resolveProviders();

        if ($providers->isEmpty()) {
            $this->components->info('No enabled external IdP providers to probe.');

            return self::SUCCESS;
        }

        $rows = [];
        $exitCode = self::SUCCESS;

        foreach ($providers as $provider) {
            try {
                $result = $action->execute($provider, 'scheduled-probe');
            } catch (Throwable $exception) {
                $exitCode = self::FAILURE;
                $rows[] = [$provider->provider_key, 'error', '-', '-', $exception->getMessage()];

                continue;
            }

            if (! $result['healthy']) {
                $exitCode = self::FAILURE;
            }

            $rows[] = [
                $provider->provider_key,
                $result['status'],
                (string) $result['consecutive_failures'],
                $result['breaker_tripped'] ? 'tripped' : 'closed',
                $result['error'] ?? '-',
            ];
        }

        $this->table(['provider', 'status', 'failures', 'breaker', 'note'], $rows);

        return $exitCode;
    }

    /**
     * @return Collection<int, ExternalIdentityProvider>
     */
    private function resolveProviders(): Collection
    {
        $key = $this->option('provider');
        $query = ExternalIdentityProvider::query()->where('enabled', true)->orderBy('provider_key');

        if (is_string($key) && $key !== '') {
            $query->where('provider_key', $key);
        }

        return $query->get();
    }
}
