<?php

declare(strict_types=1);

namespace App\Services\Security;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

final class BreachedPasswordVerifier
{
    public function isEnabled(): bool
    {
        return (bool) config('sso.password.breach_check', true);
    }

    public function isBreached(string $password): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }

        [$hash, $prefix, $suffix] = $this->sha1Parts($password);

        try {
            $response = Http::withHeaders(['Add-Padding' => true])
                ->timeout((int) config('sso.password.breach_check_timeout_seconds', 5))
                ->get('https://api.pwnedpasswords.com/range/'.$prefix);
        } catch (Throwable $exception) {
            $this->logFailOpen($exception, $prefix);

            return false;
        }

        if (! $response->successful()) {
            Log::warning('Password breach screening failed open after non-success response.', [
                'hash_prefix' => $prefix,
                'status' => $response->status(),
            ]);

            return false;
        }

        return $this->bodyContainsHashSuffix($response->body(), $hash, $prefix, $suffix);
    }

    /** @return array{0: string, 1: string, 2: string} */
    private function sha1Parts(string $password): array
    {
        $hash = strtoupper(sha1($password));

        return [$hash, substr($hash, 0, 5), substr($hash, 5)];
    }

    private function bodyContainsHashSuffix(string $body, string $hash, string $prefix, string $suffix): bool
    {
        foreach (preg_split('/\r\n|\r|\n/', $body) ?: [] as $line) {
            if (! str_contains($line, ':')) {
                continue;
            }

            [$candidateSuffix, $count] = explode(':', trim($line), 2);
            if ($candidateSuffix === $suffix && $prefix.$candidateSuffix === $hash && (int) $count > 0) {
                return true;
            }
        }

        return false;
    }

    private function logFailOpen(Throwable $exception, string $prefix): void
    {
        Log::warning('Password breach screening failed open after verifier exception.', [
            'hash_prefix' => $prefix,
            'exception' => $exception::class,
        ]);
    }
}
