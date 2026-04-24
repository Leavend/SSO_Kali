<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Services\Oidc\LogoutTokenService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\Response;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
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

    public function handle(LogoutTokenService $tokens): void
    {
        $response = Http::asForm()
            ->timeout(5)
            ->post($this->logoutUri, [
                'logout_token' => $tokens->issue($this->clientId, $this->subjectId, $this->sessionId),
            ]);

        $this->assertSuccessful($response);
    }

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30, 90];
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

        throw new RuntimeException(
            sprintf('Back-channel logout failed for client [%s] with status [%d].', $this->clientId, $response->status()),
        );
    }
}
