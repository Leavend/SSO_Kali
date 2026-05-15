<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Console\Command;
use RuntimeException;

final class VerifyStoredClientSecretPolicy extends Command
{
    protected $signature = 'oidc:verify-client-secret-policy';

    protected $description = 'Verify that stored confidential client secrets comply with Argon2id and FR-009 lifecycle policy.';

    public function handle(DownstreamClientRegistry $clients): int
    {
        try {
            $count = $clients->assertStoredSecretsCompliant();
        } catch (RuntimeException $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->components->info(sprintf(
            'Verified %d confidential client secret hash(es).',
            $count,
        ));

        return self::SUCCESS;
    }
}
