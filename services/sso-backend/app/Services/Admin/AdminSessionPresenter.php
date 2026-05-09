<?php

declare(strict_types=1);

namespace App\Services\Admin;

final class AdminSessionPresenter
{
    /**
     * @param  list<array<string, mixed>>  $sessions
     * @return array<string, mixed>|null
     */
    public function find(array $sessions, string $sessionId): ?array
    {
        foreach ($sessions as $session) {
            if (($session['session_id'] ?? null) === $sessionId) {
                return $session;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    public function revoked(array $context, array $result): array
    {
        return [
            'revoked' => true,
            ...$context,
            ...$result,
        ];
    }
}
