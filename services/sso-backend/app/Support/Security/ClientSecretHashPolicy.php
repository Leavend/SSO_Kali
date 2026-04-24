<?php

declare(strict_types=1);

namespace App\Support\Security;

use RuntimeException;

final class ClientSecretHashPolicy
{
    private const int MIN_MEMORY_KIB = 19456;

    private const int MIN_TIME_COST = 2;

    private const int MIN_THREADS = 1;

    public function make(string $secret): string
    {
        $hash = password_hash($secret, PASSWORD_ARGON2ID, $this->options());

        $this->assertCompliantHash($hash);

        return $hash;
    }

    public function verify(string $secret, string $hash): bool
    {
        $this->assertCompliantHash($hash);

        return password_verify($secret, $hash);
    }

    public function assertCompliantHash(string $hash): void
    {
        if (! str_starts_with($hash, '$argon2id$')) {
            throw new RuntimeException('Stored client secret must use an Argon2id hash.');
        }

        $this->assertParameters($this->info($hash));
    }

    /**
     * @return array{memory_cost:int, time_cost:int, threads:int}
     */
    public function parameters(): array
    {
        $options = $this->options();

        return [
            'memory_cost' => (int) $options['memory_cost'],
            'time_cost' => (int) $options['time_cost'],
            'threads' => (int) $options['threads'],
        ];
    }

    /**
     * @param  array{algoName:mixed, options:mixed}  $info
     */
    private function assertParameters(array $info): void
    {
        if (($info['algoName'] ?? null) !== 'argon2id') {
            throw new RuntimeException('Stored client secret must use Argon2id.');
        }

        $options = is_array($info['options'] ?? null) ? $info['options'] : [];
        $this->assertThreshold('memory_cost', (int) ($options['memory_cost'] ?? 0), self::MIN_MEMORY_KIB);
        $this->assertThreshold('time_cost', (int) ($options['time_cost'] ?? 0), self::MIN_TIME_COST);
        $this->assertThreshold('threads', (int) ($options['threads'] ?? 0), self::MIN_THREADS);
    }

    private function assertThreshold(string $key, int $actual, int $minimum): void
    {
        if ($actual < $minimum) {
            throw new RuntimeException("Stored client secret {$key} is below policy.");
        }
    }

    /**
     * @return array{algoName:mixed, options:mixed}
     */
    private function info(string $hash): array
    {
        /** @var array{algoName:mixed, options:mixed} $info */
        $info = password_get_info($hash);

        return $info;
    }

    /**
     * @return array{memory_cost:int, time_cost:int, threads:int}
     */
    private function options(): array
    {
        return [
            'memory_cost' => (int) config('sso.client_secret_hash.memory_cost'),
            'time_cost' => (int) config('sso.client_secret_hash.time_cost'),
            'threads' => (int) config('sso.client_secret_hash.threads'),
        ];
    }
}
