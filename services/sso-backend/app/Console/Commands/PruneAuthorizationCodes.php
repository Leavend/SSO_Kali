<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Admin\AdminRetentionRunMetadata;
use App\Services\Oidc\AuthorizationCodeStore;
use Illuminate\Console\Command;

final class PruneAuthorizationCodes extends Command
{
    protected $signature = 'sso:prune-authorization-codes';

    protected $description = 'Prune expired and consumed authorization codes from the database';

    public function handle(AuthorizationCodeStore $codes, AdminRetentionRunMetadata $runs): int
    {
        $count = $codes->pruneExpired();
        $runs->record('authorization_codes', $count);

        $this->info("Pruned {$count} authorization code row(s).");

        return self::SUCCESS;
    }
}
