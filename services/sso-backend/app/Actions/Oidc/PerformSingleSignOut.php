<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\LogoutOutcomeMetrics;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

final class PerformSingleSignOut
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly AccessTokenRevocationStore $revocations,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly BackChannelSessionRegistry $registry,
        private readonly BackChannelLogoutDispatcher $dispatcher,
        private readonly LogicalSessionStore $sessions,
        private readonly ZitadelBrokerService $broker,
        private readonly LogoutOutcomeMetrics $metrics,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $claims = $this->claims($request);
        $sessionId = is_string($claims['sid'] ?? null) ? $claims['sid'] : null;
        $subjectId = is_string($claims['sub'] ?? null) ? $claims['sub'] : null;

        if ($sessionId === null || $subjectId === null) {
            $this->metrics->recordFailure('invalid_token');

            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        $this->revocations->revokeSession($sessionId);
        $records = $this->refreshTokens->revokeSession($sessionId);
        $this->revokeUpstream($records);

        $notifications = $this->dispatcher->dispatch($subjectId, $sessionId, $this->registry->forSession($sessionId));
        $this->registry->clear($sessionId);
        $this->sessions->clear($subjectId, $sessionId);
        $this->metrics->recordSuccess();

        return response()->json([
            'signed_out' => true,
            'sid' => $sessionId,
            'notifications' => $notifications,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function claims(Request $request): array
    {
        try {
            return $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return [];
        }
    }

    /**
     * @param  list<array<string, mixed>>  $records
     */
    private function revokeUpstream(array $records): void
    {
        foreach ($this->upstreamTokens($records) as $refreshToken) {
            $this->revokeUpstreamToken($refreshToken);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $records
     * @return list<string>
     */
    private function upstreamTokens(array $records): array
    {
        $tokens = [];

        foreach ($records as $record) {
            is_string($record['upstream_refresh_token'] ?? null) && $tokens[] = $record['upstream_refresh_token'];
        }

        return array_values(array_unique($tokens));
    }

    private function revokeUpstreamToken(string $refreshToken): void
    {
        try {
            $this->broker->revoke($refreshToken, 'refresh_token');
        } catch (Throwable $exception) {
            Log::warning('[UPSTREAM_REVOCATION_FAILED]', [
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
