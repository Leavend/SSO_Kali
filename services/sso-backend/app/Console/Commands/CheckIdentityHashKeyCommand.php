<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Identity\GovernmentIdentifier;
use Illuminate\Console\Command;

final class CheckIdentityHashKeyCommand extends Command
{
    protected $signature = 'sso:check-identity-hash-key';

    protected $description = 'Validate the dedicated government identifier hash key for the current environment.';

    public function handle(): int
    {
        $environment = app()->environment();
        $this->line('Environment: '.$environment);

        if (! app()->environment('production')) {
            $this->warn('warn: SSO_NIK_HASH_KEY is only enforced by this guard in production.');

            return self::SUCCESS;
        }

        if (GovernmentIdentifier::hashKeyConfigured()) {
            $this->info('Government identifier hash key is configured.');

            return self::SUCCESS;
        }

        $this->error('error: SSO_NIK_HASH_KEY must be configured in production before storing or looking up government identifiers.');

        return self::FAILURE;
    }
}
