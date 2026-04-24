<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Console\Command;

final class PruneTokens extends Command
{
    protected $signature = 'sso:prune-tokens';

    protected $description = 'Prune expired or revoked refresh tokens from the broker store';

    public function handle(RefreshTokenStore $tokens): int
    {
        $count = $tokens->pruneExpiredAndRevoked();

        $this->info("Pruned {$count} refresh token row(s).");

        return self::SUCCESS;
    }
}
