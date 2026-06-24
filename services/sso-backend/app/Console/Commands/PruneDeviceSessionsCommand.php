<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Oidc\DeviceSessionRegistry;
use Illuminate\Console\Command;

final class PruneDeviceSessionsCommand extends Command
{
    protected $signature = 'sso:prune-device-sessions';

    protected $description = 'Prune expired or revoked device-bound account session links';

    public function handle(DeviceSessionRegistry $devices): int
    {
        $count = $devices->pruneExpiredAndRevoked();

        $this->info("Pruned {$count} device session row(s).");

        return self::SUCCESS;
    }
}
