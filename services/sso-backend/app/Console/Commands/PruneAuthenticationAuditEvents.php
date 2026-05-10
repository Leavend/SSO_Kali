<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Audit\AuthenticationAuditRetentionPolicy;
use Illuminate\Console\Command;

final class PruneAuthenticationAuditEvents extends Command
{
    protected $signature = 'sso:prune-authentication-audit-events
        {--dry-run : Report candidate rows without deleting them}
        {--limit=1000 : Maximum number of rows to prune in one run}';

    protected $description = 'Prune central authentication audit events beyond the configured retention window';

    public function handle(AuthenticationAuditRetentionPolicy $retention): int
    {
        $limit = $this->limit();
        $report = $retention->report();

        $this->line('Authentication audit retention days: '.$report['retention_days']);
        $this->line('Authentication audit cutoff: '.$report['cutoff']);
        $this->line('Authentication audit prune candidate row(s): '.$report['candidate_count']);

        if ($this->option('dry-run') === true) {
            $this->info('Dry run enabled; no authentication audit rows were pruned.');

            return self::SUCCESS;
        }

        $count = $retention->prune(limit: $limit);

        $this->info("Pruned {$count} authentication audit event row(s).");

        return self::SUCCESS;
    }

    private function limit(): int
    {
        $limit = $this->option('limit');

        if (! is_numeric($limit)) {
            return 1000;
        }

        return max(1, min(10000, (int) $limit));
    }
}
