<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Oidc\AuthorizationCodeStore;
use Illuminate\Console\Command;

final class PruneAuthorizationCodes extends Command
{
    protected $signature = 'sso:prune-authorization-codes';

    protected $description = 'Prune expired and consumed authorization codes from the database';

    public function handle(AuthorizationCodeStore $codes): int
    {
        $count = $codes->pruneExpired();

        $this->info("Pruned {$count} authorization code row(s).");

        return self::SUCCESS;
    }
}
