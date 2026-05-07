<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Oidc\ValidateProductionOidcClientRegistryAction;
use Illuminate\Console\Command;

final class ValidateProductionOidcClients extends Command
{
    protected $signature = 'sso:oidc-clients:validate-production';

    protected $description = 'Validate the production OIDC client registry hardening policy.';

    public function handle(ValidateProductionOidcClientRegistryAction $validate): int
    {
        $result = $validate->execute();

        if ($result['valid']) {
            $this->info(sprintf(
                'OIDC production client registry is valid. Checked %d clients and %d confidential clients.',
                $result['checked_clients'],
                $result['checked_confidential_clients'],
            ));

            return self::SUCCESS;
        }

        $this->error('OIDC production client registry is invalid.');

        foreach ($result['errors'] as $error) {
            $this->line('- '.$error);
        }

        return self::FAILURE;
    }
}
