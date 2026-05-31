<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Admin\AdminRetentionRunMetadata;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Console\Command;

final class PruneTokens extends Command
{
    protected $signature = 'sso:prune-tokens';

    protected $description = 'Prune expired or revoked refresh tokens from the SSO store';

    public function handle(RefreshTokenStore $tokens, AdminRetentionRunMetadata $runs): int
    {
        $count = $tokens->pruneExpiredAndRevoked();
        $runs->record('refresh_tokens', $count);

        $this->info("Pruned {$count} refresh token row(s).");

        return self::SUCCESS;
    }
}
