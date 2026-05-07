<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use Illuminate\Support\Facades\Log;

final class RecordLogoutAuditEventAction
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(string $event, array $context = []): void
    {
        Log::info('[SSO_LOGOUT_AUDIT]', [
            'event' => $event,
            'context' => $this->safeContext($context),
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function safeContext(array $context): array
    {
        unset($context['logout_token'], $context['access_token'], $context['refresh_token']);

        return $context;
    }
}
