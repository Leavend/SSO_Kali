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
            $this->dispatchJob($registration, $subjectId, $sessionId);
        } catch (Throwable $exception) {
            $this->logDispatchFailure($registration, $exception);
            $this->auditDispatchFailure($registration, $subjectId, $sessionId, $exception);

            return $this->failedResult($registration, $exception);
        }

        $this->auditQueued($registration, $subjectId, $sessionId);

        return $this->queuedResult($registration);
    }

    /** @param array<string, string> $registration */
    private function dispatchJob(array $registration, string $subjectId, string $sessionId): void
    {
        DispatchBackChannelLogoutJob::dispatch(
            (string) $registration['client_id'],
            $subjectId,
            $sessionId,
            (string) $registration['backchannel_logout_uri'],
        );
    }

    /** @param array<string, string> $registration */
    private function logDispatchFailure(array $registration, Throwable $exception): void
    {
        Log::warning('[BCL_DISPATCH_FAILED]', [
            'client_id' => (string) ($registration['client_id'] ?? 'unknown'),
            'error' => $exception->getMessage(),
        ]);
    }

    /** @param array<string, string> $registration */
    private function auditDispatchFailure(
        array $registration,
        string $subjectId,
        string $sessionId,
        Throwable $exception,
    ): void {
        $this->audit->execute('backchannel_logout_failed', [
            'client_id' => (string) ($registration['client_id'] ?? 'unknown'),
            'failure_class' => 'queue_dispatch_failed',
            'failure_reason' => $exception->getMessage(),
            'http_status' => 0,
            'logout_channel' => 'backchannel',
            'result' => 'failed',
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
        ]);
    }

    /** @param array<string, string> $registration */
    private function auditQueued(array $registration, string $subjectId, string $sessionId): void
    {
        $this->audit->execute('backchannel_logout_queued', [
            'client_id' => (string) $registration['client_id'],
            'http_status' => 202,
            'logout_channel' => 'backchannel',
            'result' => 'queued',
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
        ]);
    }

    /**
     * @param  array<string, string>  $registration
     * @return array<string, int|string>
     */
    private function queuedResult(array $registration): array
    {
        return [
            'client_id' => (string) $registration['client_id'],
            'status' => 'queued',
            'http_status' => 202,
        ];
    }

    /**
     * @param  array<string, string>  $registration
     * @return array<string, int|string>
     */
    private function failedResult(array $registration, Throwable $exception): array
    {
        return [
            'client_id' => (string) ($registration['client_id'] ?? 'unknown'),
            'status' => 'failed',
            'http_status' => 0,
            'failure_class' => 'queue_dispatch_failed',
            'failure_reason' => $exception->getMessage(),
        ];
    }
}
