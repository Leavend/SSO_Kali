<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

final class ProvisionStressIdentity extends Command
{
    protected $signature = 'sso:provision-stress-identity
        {--email=stress-sso@timeh.my.id : Dedicated stress-test user email}
        {--subject-id=usr_stress_sso_prod : Stable dedicated stress-test subject ID}
        {--password= : Plaintext password supplied through a secure deployment secret}';

    protected $description = 'Provision the dedicated production SSO stress-test user idempotently.';

    public function handle(): int
    {
        $email = $this->requiredOption('email');
        $subjectId = $this->requiredOption('subject-id');
        $password = $this->requiredOption('password');

        if (strlen($password) < 16) {
            $this->error('Stress identity password must be at least 16 characters.');

            return self::FAILURE;
        }

        $user = User::query()->updateOrCreate(
            ['subject_id' => $subjectId],
            [
                'email' => $email,
                'password' => Hash::make($password),
                'display_name' => 'SSO Production Stress Test User',
                'role' => 'stress_test',
                'status' => 'active',
                'local_account_enabled' => true,
                'email_verified_at' => now(),
                'disabled_at' => null,
                'disabled_reason' => null,
            ],
        );

        $this->info('Stress identity provisioned.');
        $this->line(sprintf('subject_id=%s', $user->subject_id));
        $this->line(sprintf('email=%s', $user->email));
        $this->line('password=<redacted>');

        return self::SUCCESS;
    }

    private function requiredOption(string $name): string
    {
        $value = $this->option($name);

        if (! is_string($value) || $value === '') {
            throw new \InvalidArgumentException(sprintf('Option [%s] is required.', $name));
        }

        return $value;
    }
}
