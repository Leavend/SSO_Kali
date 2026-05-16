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
            if ($this->hasBackchannel($registration)) {
                $results[] = $this->notify($registration, $subjectId, $sessionId);

                continue;
            }

            if ($this->hasFrontchannel($registration)) {
                $results[] = $this->frontchannelPending($registration, $subjectId, $sessionId);

                continue;
            }

            // No usable channel: treat as a hard dispatch failure so callers
            // can report it the same as queue dispatch errors. This preserves
            // the prior FR-040 invariant that registrations without any URI
            // surface as `failed` instead of being silently swallowed.
            $results[] = $this->failedRegistration($registration, $subjectId, $sessionId);
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $registration
     */
    private function hasBackchannel(array $registration): bool
    {
        $uri = $registration['backchannel_logout_uri'] ?? null;

        return is_string($uri) && $uri !== '';
    }

    /**
     * @param  array<string, mixed>  $registration
     */
    private function hasFrontchannel(array $registration): bool
    {
        $uri = $registration['frontchannel_logout_uri'] ?? null;

        return is_string($uri) && $uri !== '';
    }

    /**
     * BE-FR043-001: RPs registered with `frontchannel_logout_uri` only
     * cannot be notified by the back-channel dispatcher. They are still
     * surfaced in the dispatch result so the global logout response can
     * render an iframe fallback page (see {@see RenderFrontChannelLogoutFallback}).
     *
     * @param  array<string, mixed>  $registration
     * @return array<string, int|string>
     */
    private function frontchannelPending(array $registration, string $subjectId, string $sessionId): array
    {
        $clientId = (string) ($registration['client_id'] ?? 'unknown');
        $frontchannelUri = is_string($registration['frontchannel_logout_uri'] ?? null)
            ? $registration['frontchannel_logout_uri']
            : null;

        $this->audit->execute('frontchannel_logout_pending', [
            'client_id' => $clientId,
            'logout_channel' => 'frontchannel',
            'result' => 'pending',
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
            'frontchannel_logout_uri' => $frontchannelUri,
        ]);

        return [
            'client_id' => $clientId,
            'status' => 'frontchannel_pending',
            'http_status' => 0,
            'frontchannel_logout_uri' => (string) ($frontchannelUri ?? ''),
        ];
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

    /**
     * Treat a registration without any usable logout channel as a hard
     * dispatch failure. The audit row mirrors a queue-dispatch error so
     * downstream alerting (FR-044) sees a single failure semantic.
     *
     * @param  array<string, mixed>  $registration
     * @return array<string, int|string>
     */
    private function failedRegistration(array $registration, string $subjectId, string $sessionId): array
    {
        $clientId = (string) ($registration['client_id'] ?? 'unknown');
        $reason = 'No backchannel_logout_uri or frontchannel_logout_uri registered.';

        $this->audit->execute('backchannel_logout_failed', [
            'client_id' => $clientId,
            'failure_class' => 'queue_dispatch_failed',
            'failure_reason' => $reason,
            'http_status' => 0,
            'logout_channel' => 'backchannel',
            'result' => 'failed',
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
        ]);

        return [
            'client_id' => $clientId,
            'status' => 'failed',
            'http_status' => 0,
            'failure_class' => 'queue_dispatch_failed',
            'failure_reason' => $reason,
        ];
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
