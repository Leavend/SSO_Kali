<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\AdminAuditEvent;
use Illuminate\Console\Command;

final class PruneAdminAuditEventsCommand extends Command
{
    public const MIN_RETENTION_DAYS = 365;

    public const MAX_PRUNE_BATCH = 5_000;

    /** @var string */
    protected $signature = 'sso:prune-admin-audit-events
        {--retention-days=730 : Retention horizon (must be >= '.self::MIN_RETENTION_DAYS.')}
        {--limit=1000 : Max rows to delete in one run (capped at '.self::MAX_PRUNE_BATCH.')}
        {--dry-run : Report counts without deleting}';

    /** @var string */
    protected $description = 'Prune admin_audit_events older than the configured retention horizon (immutable-by-default chain).';

    public function handle(): int
    {
        $retentionDays = (int) $this->option('retention-days');
        if ($retentionDays < self::MIN_RETENTION_DAYS) {
            $this->error(sprintf(
                'retention-days must be at least %d (received %d).',
                self::MIN_RETENTION_DAYS,
                $retentionDays,
            ));

            return Command::INVALID;
        }

        $limit = min(self::MAX_PRUNE_BATCH, max(1, (int) $this->option('limit')));
        $cutoff = now()->subDays($retentionDays);

        $candidates = AdminAuditEvent::query()
            ->where('occurred_at', '<', $cutoff)
            ->orderBy('id')
            ->limit($limit);

        $count = (clone $candidates)->count();

        if ($this->option('dry-run')) {
            $this->info(sprintf(
                'DRY-RUN: %d admin_audit_events older than %s would be pruned.',
                $count,
                $cutoff->toIso8601String(),
            ));

            return Command::SUCCESS;
        }

        AdminAuditEvent::withPruneAllowed(function () use ($candidates): void {
            $candidates->get()->each(static fn (AdminAuditEvent $event) => $event->delete());
        });

        $this->info(sprintf(
            'Pruned %d admin_audit_events older than %s.',
            $count,
            $cutoff->toIso8601String(),
        ));

        return Command::SUCCESS;
    }
}
