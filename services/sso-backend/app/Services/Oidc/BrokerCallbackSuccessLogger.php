<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use Illuminate\Support\Facades\Log;

final class BrokerCallbackSuccessLogger
{
    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $authContext
     */
    public function record(array $context, string $subjectId, string $logicalSessionId, array $authContext, bool $hasRefreshToken): void
    {
        Log::info('[OIDC_BROKER_CALLBACK_SUCCEEDED]', [
            'client_id' => (string) ($context['client_id'] ?? ''),
            'subject_id' => $subjectId,
            'broker_session_id' => (string) ($context['session_id'] ?? ''),
            'logical_session_id' => $logicalSessionId,
            'scope' => (string) ($context['scope'] ?? ''),
            'auth_time' => is_int($authContext['auth_time'] ?? null) ? $authContext['auth_time'] : null,
            'amr' => $this->amr($authContext['amr'] ?? null),
            'acr' => is_string($authContext['acr'] ?? null) ? $authContext['acr'] : null,
            'upstream_refresh_token_present' => $hasRefreshToken,
        ]);
    }

    /**
     * @return list<string>
     */
    private function amr(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn (mixed $item): bool => is_string($item) && $item !== ''));
    }
}
