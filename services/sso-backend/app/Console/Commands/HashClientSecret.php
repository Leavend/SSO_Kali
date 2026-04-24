<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Console\Command;

/**
 * PRD §8.2 — Argon2id Secret Hashing.
 *
 * Usage:
 *   php artisan oidc:hash-secret
 *
 * Copy the resulting hash into APP_B_CLIENT_SECRET_HASH (or the relevant
 * env variable).  The raw plaintext secret goes to the client owner.
 */
final class HashClientSecret extends Command
{
    protected $signature = 'oidc:hash-secret {--secret= : The plaintext secret to hash (prompted if omitted)}';

    protected $description = 'Generate an Argon2id hash of an OIDC client secret (PRD §8.2)';

    public function __construct(
        private readonly ClientSecretHashPolicy $policy,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $secret = $this->resolveSecret();

        if ($secret === '') {
            $this->error('Secret must not be empty.');

            return self::FAILURE;
        }

        $hash = $this->policy->make($secret);
        $parameters = $this->policy->parameters();

        $this->newLine();
        $this->line('<fg=green>Argon2id hash (store this in config/env):</>');
        $this->line($hash);
        $this->newLine();
        $this->line(sprintf(
            '<fg=cyan>Parameters:</> memory_cost=%d KiB, time_cost=%d, threads=%d',
            $parameters['memory_cost'],
            $parameters['time_cost'],
            $parameters['threads'],
        ));
        $this->newLine();
        $this->line('<fg=yellow>Verification test:</>');
        $this->line(password_verify($secret, $hash) ? '✅ password_verify() = true' : '❌ FAILED');

        return self::SUCCESS;
    }

    private function resolveSecret(): string
    {
        $option = $this->option('secret');

        if (is_string($option) && $option !== '') {
            return $option;
        }

        return (string) $this->secret('Enter the plaintext client secret');
    }
}
