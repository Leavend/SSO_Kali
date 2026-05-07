<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use Illuminate\Support\Facades\Log;
use Throwable;

final class BackChannelLogoutDispatcher
{
    public function __construct(
        private readonly RecordLogoutAuditEventAction $audit,
    ) {}

    /**
     * @param  list<array<string, string>>  $registrations
     * @return list<array<string, int|string>>
     */
    public function dispatch(string $subjectId, string $sessionId, array $registrations): array
    {
        $results = [];

        foreach ($registrations as $registration) {
            $results[] = $this->notify($registration, $subjectId, $sessionId);
        }

        return $results;
    }

    /**
     * @param  array<string, string>  $registration
     * @return array<string, int|string>
     */
    private function notify(array $registration, string $subjectId, string $sessionId): array
    {
        try {
            DispatchBackChannelLogoutJob::dispatch(
                (string) $registration['client_id'],
                $subjectId,
                $sessionId,
                (string) $registration['backchannel_logout_uri'],
            );
        } catch (Throwable $exception) {
            Log::warning('[BCL_DISPATCH_FAILED]', [
                'client_id' => (string) $registration['client_id'],
                'error' => $exception->getMessage(),
            ]);

            $this->audit->execute('backchannel_logout_failed', [
                'client_id' => (string) $registration['client_id'],
                'session_id' => $sessionId,
                'reason' => 'queue_dispatch_failed',
            ]);

            return [
                'client_id' => (string) $registration['client_id'],
                'status' => 'failed',
                'http_status' => 0,
            ];
        }

        $this->audit->execute('backchannel_logout_queued', [
            'client_id' => (string) $registration['client_id'],
            'session_id' => $sessionId,
            'http_status' => 202,
        ]);

        return [
            'client_id' => (string) $registration['client_id'],
            'status' => 'queued',
            'http_status' => 202,
        ];
    }
}
