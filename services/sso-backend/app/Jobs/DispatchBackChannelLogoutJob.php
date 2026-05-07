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
    ) {
        $this->onQueue('backchannel-logout');
    }

    public function handle(LogoutTokenService $tokens, RecordLogoutAuditEventAction $audit): void
    {
        $this->assertLogoutUriAllowed();

        $response = Http::asForm()
            ->timeout($this->timeoutSeconds())
            ->post($this->logoutUri, [
                'logout_token' => $tokens->issue($this->clientId, $this->subjectId, $this->sessionId),
            ]);

        $this->assertSuccessful($response);
        $this->recordSuccess($audit, $response);
    }

    public function backoff(): array
    {
        return array_map(
            static fn (string|int $seconds): int => max(1, (int) $seconds),
            (array) config('sso.logout.backchannel_backoff_seconds', [10, 30, 90]),
        );
    }

    public function tags(): array
    {
        return [
            'backchannel-logout',
            'client:'.$this->clientId,
            'session:'.$this->sessionId,
        ];
    }

    private function assertSuccessful(Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        Log::warning('[BACKCHANNEL_LOGOUT_FAILED]', [
            'client_id' => $this->clientId,
            'session_id' => $this->sessionId,
            'http_status' => $response->status(),
        ]);

        throw new RuntimeException(
            sprintf('Back-channel logout failed for client [%s] with status [%d].', $this->clientId, $response->status()),
        );
    }

    private function assertLogoutUriAllowed(): void
    {
        $parts = parse_url($this->logoutUri);

        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            throw new RuntimeException('Back-channel logout URI is malformed.');
        }

        if ($this->requiresHttps() && $parts['scheme'] !== 'https') {
            throw new RuntimeException('Back-channel logout URI must use HTTPS in production.');
        }
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

    private function recordSuccess(RecordLogoutAuditEventAction $audit, Response $response): void
    {
        $audit->execute('backchannel_logout_succeeded', [
            'client_id' => $this->clientId,
            'session_id' => $this->sessionId,
            'http_status' => $response->status(),
        ]);
    }
}
