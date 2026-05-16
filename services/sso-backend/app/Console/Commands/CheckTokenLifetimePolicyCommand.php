<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Security\ValidateTokenLifetimePolicyAction;
use Illuminate\Console\Command;

/**
 * BE-FR038-001 — Token lifetime policy deploy guard.
 *
 *   php artisan sso:check-token-lifetime-policy
 *
 * Exit codes:
 *   0 = policy within bounds
 *   1 = policy violation (deploy must fail)
 */
final class CheckTokenLifetimePolicyCommand extends Command
{
    protected $signature = 'sso:check-token-lifetime-policy';

    protected $description = 'Validate token lifetime policy bounds (FR-038) for the current environment.';

    public function handle(ValidateTokenLifetimePolicyAction $validate): int
    {
        $result = $validate->execute();

        $this->line('Environment: '.$result['environment']);
        $this->line('Fingerprint: '.$result['fingerprint']);
        foreach ($result['policy'] as $key => $value) {
            $this->line(sprintf('  %s = %d', $key, $value));
        }

        if ($result['valid']) {
            $this->info('Token lifetime policy is within FR-038 bounds.');

            return self::SUCCESS;
        }

        foreach ($result['violations'] as $violation) {
            $this->error('error: '.$violation);
        }

        return self::FAILURE;
    }
}
