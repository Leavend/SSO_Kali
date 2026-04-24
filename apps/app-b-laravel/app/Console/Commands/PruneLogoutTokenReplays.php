<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Sso\LogoutTokenReplayStore;
use Illuminate\Console\Command;

final class PruneLogoutTokenReplays extends Command
{
    protected $signature = 'sso:prune-logout-token-replays {--dry-run : Report expired markers without deleting them}';

    protected $description = 'Prune expired logout token replay markers.';

    public function handle(LogoutTokenReplayStore $store): int
    {
        $deleted = $this->dryRun()
            ? $store->expiredCount()
            : $store->pruneExpired();

        $this->components->info($this->summary($deleted));

        return self::SUCCESS;
    }

    private function dryRun(): bool
    {
        return (bool) $this->option('dry-run');
    }

    private function summary(int $deleted): string
    {
        if ($this->dryRun()) {
            return sprintf('Found %d expired logout replay markers.', $deleted);
        }

        return sprintf('Pruned %d expired logout replay markers.', $deleted);
    }
}
