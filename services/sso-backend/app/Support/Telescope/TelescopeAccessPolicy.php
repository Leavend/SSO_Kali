<?php

declare(strict_types=1);

namespace App\Support\Telescope;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\IpUtils;

final class TelescopeAccessPolicy
{
    public function allows(Request $request): bool
    {
        if (
            ! $this->enabledForEnvironment()
            || ! $this->hostAllowed($request->getHost())
            || ! $this->ipAllowed($request->ip())
        ) {
            return false;
        }

        if (! $this->credentialsRequired()) {
            return true;
        }

        return $this->credentialsMatch($request->getUser(), $request->getPassword());
    }

    public function shouldChallenge(Request $request): bool
    {
        return $this->enabledForEnvironment()
            && $this->hostAllowed($request->getHost())
            && $this->ipAllowed($request->ip())
            && $this->credentialsRequired()
            && ! $this->credentialsMatch($request->getUser(), $request->getPassword());
    }

    public function shouldRecordAll(): bool
    {
        return $this->enabledForEnvironment() && (bool) config('telescope.record_all', false);
    }

    private function enabledForEnvironment(): bool
    {
        return (bool) config('telescope.enabled', false)
            && in_array((string) config('app.env', 'production'), $this->allowedEnvironments(), true);
    }

    /**
     * @return list<string>
     */
    private function allowedEnvironments(): array
    {
        return $this->strings((array) config('telescope.allowed_environments', ['local']));
    }

    private function ipAllowed(?string $ip): bool
    {
        $ranges = $this->strings((array) config('telescope.allowed_ips', []));

        if ($ranges === []) {
            return true;
        }

        if (! is_string($ip) || $ip === '') {
            return false;
        }

        foreach ($ranges as $range) {
            if (IpUtils::checkIp($ip, $range)) {
                return true;
            }
        }

        return false;
    }

    private function hostAllowed(string $host): bool
    {
        $allowedHosts = $this->strings((array) config('telescope.allowed_hosts', []));

        if ($allowedHosts === []) {
            return false;
        }

        return in_array(mb_strtolower($host), $this->normalizedHosts($allowedHosts), true);
    }

    private function credentialsRequired(): bool
    {
        return $this->username() !== '' && $this->password() !== '';
    }

    private function credentialsMatch(?string $username, ?string $password): bool
    {
        return is_string($username)
            && is_string($password)
            && hash_equals($this->username(), $username)
            && hash_equals($this->password(), $password);
    }

    private function username(): string
    {
        return (string) data_get(config('telescope.basic_auth'), 'username', '');
    }

    private function password(): string
    {
        return (string) data_get(config('telescope.basic_auth'), 'password', '');
    }

    /**
     * @param  list<string>  $hosts
     * @return list<string>
     */
    private function normalizedHosts(array $hosts): array
    {
        return array_map(
            static fn (string $host): string => mb_strtolower($host),
            $hosts,
        );
    }

    /**
     * @param  array<int, mixed>  $values
     * @return list<string>
     */
    private function strings(array $values): array
    {
        return array_values(array_filter(array_map(
            static fn (mixed $value): string => is_string($value) ? trim($value) : '',
            $values,
        )));
    }
}
