<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Services\Oidc\LogoutTokenService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\Response;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

final class DispatchBackChannelLogoutJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $maxExceptions = 3;

    public int $timeout = 10;

    public function __construct(
        public readonly string $clientId,
        public readonly string $subjectId,
        public readonly string $sessionId,
        public readonly string $logoutUri,
        public readonly ?string $requestId = null,
    ) {
        $this->onQueue('backchannel-logout');
    }

    public function handle(LogoutTokenService $tokens, RecordLogoutAuditEventAction $audit): void
    {
        $this->assertLogoutUriAllowed($audit);

        $response = Http::asForm()
            ->timeout($this->timeoutSeconds())
            ->post($this->logoutUri, [
                'logout_token' => $tokens->issue($this->clientId, $this->subjectId, $this->sessionId),
            ]);

        $this->assertSuccessful($response, $audit);
        $this->recordSuccess($audit, $response);
    }

    public function backoff(): array
    {
        return array_map(
            static fn (string|int $seconds): int => max(1, (int) $seconds),
            (array) config('sso.logout.backchannel_backoff_seconds', [10, 30, 90]),
        );
    }

    public function failed(?\Throwable $exception): void
    {
        app(RecordLogoutAuditEventAction::class)->execute('backchannel_logout_dead_lettered', $this->auditContext([
            'failure_class' => 'retry_exhausted',
            'failure_reason' => $exception?->getMessage(),
            'result' => 'failed',
            'terminal' => true,
        ]));
    }

    public function tags(): array
    {
        return [
            'backchannel-logout',
            'client:'.$this->clientId,
            'session:'.$this->sessionId,
        ];
    }

    private function assertSuccessful(Response $response, RecordLogoutAuditEventAction $audit): void
    {
        if ($response->successful()) {
            return;
        }

        $context = $this->auditContext([
            'failure_class' => 'non_success_response',
            'http_status' => $response->status(),
        ]);

        Log::warning('[BACKCHANNEL_LOGOUT_FAILED]', $context);
        $audit->execute('backchannel_logout_failed', $context);

        throw new RuntimeException(
            sprintf('Back-channel logout failed for client [%s] with status [%d].', $this->clientId, $response->status()),
        );
    }

    private function assertLogoutUriAllowed(RecordLogoutAuditEventAction $audit): void
    {
        $parts = parse_url($this->logoutUri);

        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            $this->recordUriPolicyFailure($audit, 'malformed_uri');
            throw new RuntimeException('Back-channel logout URI is malformed.');
        }

        if ($this->requiresHttps() && $parts['scheme'] !== 'https') {
            $this->recordUriPolicyFailure($audit, 'https_required');
            throw new RuntimeException('Back-channel logout URI must use HTTPS in production.');
        }
    }

    private function recordUriPolicyFailure(RecordLogoutAuditEventAction $audit, string $reason): void
    {
        $audit->execute('backchannel_logout_failed', $this->auditContext([
            'failure_class' => 'uri_policy_violation',
            'failure_reason' => $reason,
            'http_status' => 0,
        ]));
    }

    private function requiresHttps(): bool
    {
        return app()->environment('production')
            && (bool) config('sso.logout.backchannel_require_https', true);
    }

    private function timeoutSeconds(): int
    {
        return max(1, (int) config('sso.logout.backchannel_timeout_seconds', 5));
    }

    private function attemptNumber(): int
    {
        return max(1, $this->attempts());
    }

    /**
     * @return array{scheme: string|null, host: string|null, path: string|null}
     */
    private function safeEndpoint(): array
    {
        $parts = parse_url($this->logoutUri);

        return [
            'scheme' => is_array($parts) ? ($parts['scheme'] ?? null) : null,
            'host' => is_array($parts) ? ($parts['host'] ?? null) : null,
            'path' => is_array($parts) ? ($parts['path'] ?? null) : null,
        ];
    }

    private function recordSuccess(RecordLogoutAuditEventAction $audit, Response $response): void
    {
        $audit->execute('backchannel_logout_succeeded', $this->auditContext([
            'http_status' => $response->status(),
            'result' => 'succeeded',
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function auditContext(array $overrides = []): array
    {
        return array_merge([
            'attempt' => $this->attemptNumber(),
            'client_id' => $this->clientId,
            'endpoint' => $this->safeEndpoint(),
            'logout_channel' => 'backchannel',
            'result' => 'failed',
            'session_id' => $this->sessionId,
            'subject_id' => $this->subjectId,
            'request_id' => $this->requestId,
        ], $overrides);
    }
}
