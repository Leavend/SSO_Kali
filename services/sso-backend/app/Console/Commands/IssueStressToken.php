<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

final class IssueStressToken extends Command
{
    private const STRESS_SUBJECT_ID = 'usr_stress_sso_prod';

    private const STRESS_CLIENT_ID = 'sso-load-test-client';

    protected $signature = 'sso:issue-stress-token
        {--subject-id=usr_stress_sso_prod : Dedicated stress-test subject ID}
        {--client-id=sso-load-test-client : Dedicated load-test OIDC client ID}
        {--scope=openid profile email : Space-delimited scopes for profile stress}
        {--ttl-minutes=30 : Short-lived token TTL hint for operator visibility}';

    protected $description = 'Issue a short-lived bearer token for the dedicated production stress-test identity.';

    public function handle(LocalTokenService $tokens, DownstreamClientRegistry $clients): int
    {
        $subjectId = $this->requiredOption('subject-id');
        $clientId = $this->requiredOption('client-id');
        $scope = $this->requiredOption('scope');
        $ttlMinutes = $this->positiveIntegerOption('ttl-minutes');

        if ($subjectId !== self::STRESS_SUBJECT_ID || $clientId !== self::STRESS_CLIENT_ID) {
            $this->error('Only the dedicated stress identity can receive stress tokens.');

            return self::FAILURE;
        }

        if ($clients->find($clientId) === null) {
            $this->error('Dedicated load-test client is not enabled or registered.');

            return self::FAILURE;
        }

        if (! User::query()->where('subject_id', $subjectId)->exists()) {
            $this->error('Dedicated stress identity does not exist. Run sso:provision-stress-identity first.');

            return self::FAILURE;
        }

        $issued = $tokens->issue([
            'subject_id' => $subjectId,
            'client_id' => $clientId,
            'scope' => $scope,
            'session_id' => 'stress-'.Str::uuid()->toString(),
            'auth_time' => now()->timestamp,
            'amr' => ['stress_token'],
        ]);

        $expiresIn = $ttlMinutes * 60;

        $this->line('STRESS_ACCESS_TOKEN='.$issued['access_token']);
        $this->line('token_type=Bearer');
        $this->line(sprintf('expires_in=%d', $expiresIn));
        $this->line(sprintf('scope=%s', $scope));

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

    private function positiveIntegerOption(string $name): int
    {
        $value = $this->option($name);
        $integer = filter_var($value ?? 30, FILTER_VALIDATE_INT);

        if (! is_int($integer) || $integer < 1 || $integer > 60) {
            throw new \InvalidArgumentException(sprintf('Option [%s] must be an integer between 1 and 60.', $name));
        }

        return $integer;
    }
}
