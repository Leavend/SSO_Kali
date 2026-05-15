<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Admin\ValidateAdminMfaPolicyAction;
use Illuminate\Console\Command;

/**
 * BE-FR018-001 — Deploy guard.
 *
 * Run this command during deploy or via Laravel's `about` workflow to ensure
 * the admin MFA enforcement policy is safe for production.
 *
 *   php artisan sso:check-admin-mfa-policy
 *
 * Exit codes:
 *   0 = policy is safe
 *   1 = policy violation (deploy must fail)
 */
final class CheckAdminMfaPolicyCommand extends Command
{
    protected $signature = 'sso:check-admin-mfa-policy';

    protected $description = 'Validate admin MFA enforcement policy for the current environment.';

    public function handle(ValidateAdminMfaPolicyAction $validate): int
    {
        $result = $validate->execute();

        $this->line('Environment: '.$result['environment']);

        foreach ($result['warnings'] as $warning) {
            $this->warn('warn: '.$warning);
        }

        if ($result['valid']) {
            $this->info('Admin MFA policy is safe.');

            return self::SUCCESS;
        }

        foreach ($result['errors'] as $error) {
            $this->error('error: '.$error);
        }

        return self::FAILURE;
    }
}
