<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\LogoutOutcomeMetrics;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\Upstream\UpstreamOidcClient;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
        private readonly UpstreamOidcClient $upstream,
        private readonly LogoutOutcomeMetrics $metrics,
        private readonly RecordLogoutAuditEventAction $audit,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $context = $this->logoutContext($request);

        if ($context === null) {
            $this->metrics->recordFailure('invalid_token');
            $this->audit->execute('sso_logout_failed', [
                'failure_class' => 'invalid_token',
                'logout_channel' => 'centralized',
                'reason' => 'invalid_token',
                'result' => 'failed',
            ]);

            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        [$sessionId, $subjectId] = $context;
        $requestId = (string) $request->headers->get('X-Request-Id', 'n/a');
        $idempotencyKey = $this->idempotencyKey($sessionId, $subjectId, $requestId);
        $cached = Cache::get($idempotencyKey);

        if (is_array($cached)) {
            return response()->json($cached + ['idempotent_replay' => true]);
        }

        $this->audit->execute('sso_logout_started', [
            'logout_channel' => 'centralized',
            'result' => 'started',
            'session_id' => $sessionId,
            'sid' => $sessionId,
            'sub' => $subjectId,
            'subject_id' => $subjectId,
            'request_id' => $requestId,
        ]);

        $records = $this->refreshTokens->revokeSubject($subjectId);

        $response = $this->completeLogout($sessionId, $subjectId, $records, $requestId);
        $payload = $response->getData(true);
        Cache::put($idempotencyKey, $payload, now()->addMinutes(15));

        return $response;
    }

    /**
     * @param  list<array<string, mixed>>  $records
     */
    private function completeLogout(string $sessionId, string $subjectId, array $records, string $requestId): JsonResponse
    {
        $sessionIds = $this->sessionIds($sessionId, $subjectId, $records);

        $this->revokeAccessTokens($sessionIds);
        $this->revokeUpstream($records);

        $notifications = $this->dispatchLogout($subjectId, $sessionIds, $requestId);
        $this->clearLocalSessions($subjectId, $sessionIds);
        $this->metrics->recordSuccess();
        $frontchannelUrl = $this->frontchannelFallbackUrl($notifications);
        $this->audit->execute('sso_logout_completed', [
            'logout_channel' => 'centralized',
            'notification_count' => count($notifications),
            'frontchannel_pending_count' => $this->countByStatus($notifications, 'frontchannel_pending'),
            'result' => 'succeeded',
            'session_count' => count($sessionIds),
            'session_id' => $sessionId,
            'sid' => $sessionId,
            'sub' => $subjectId,
            'subject_id' => $subjectId,
            'request_id' => $requestId,
        ]);

        return $this->successResponse($sessionId, $sessionIds, $notifications, $frontchannelUrl);
    }

    /**
     * @return array{0: string, 1: string}|null
     */
    private function logoutContext(Request $request): ?array
    {
        $claims = $this->claims($request);
        $sessionId = $this->stringClaim($claims, 'sid');
        $subjectId = $this->stringClaim($claims, 'sub');

        return $sessionId !== null && $subjectId !== null ? [$sessionId, $subjectId] : null;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function stringClaim(array $claims, string $key): ?string
    {
        $value = $claims[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  list<string>  $sessionIds
     */
    private function revokeAccessTokens(array $sessionIds): void
    {
        foreach ($sessionIds as $sessionId) {
            $this->revocations->revokeSession($sessionId);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $records
     * @return list<string>
     */
    private function sessionIds(string $sessionId, string $subjectId, array $records): array
    {
        return $this->uniqueStrings([
            $sessionId,
            ...$this->recordSessionIds($records),
            ...$this->registry->sessionIdsForSubject($subjectId),
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $records
     * @return list<string>
     */
    private function recordSessionIds(array $records): array
    {
        return array_values(array_filter(
            array_map(static fn (array $record): mixed => $record['session_id'] ?? null, $records),
            'is_string',
        ));
    }

    /**
     * @param  list<string>  $values
     * @return list<string>
     */
    private function uniqueStrings(array $values): array
    {
        return array_values(array_unique(array_filter($values, static fn (string $value): bool => $value !== '')));
    }

    /**
     * @param  list<string>  $sessionIds
     * @return list<array<string, mixed>>
     */
    private function dispatchLogout(string $subjectId, array $sessionIds, string $requestId): array
    {
        $notifications = [];

        foreach ($sessionIds as $sessionId) {
            $notifications = [
                ...$notifications,
                ...$this->dispatcher->dispatch($subjectId, $sessionId, $this->registry->forSession($sessionId), $requestId),
            ];
        }

        return $notifications;
    }

    private function idempotencyKey(string $sessionId, string $subjectId, string $requestId): string
    {
        return 'sso:logout:idempotency:'.hash('sha256', $subjectId.'|'.$sessionId.'|'.$requestId);
    }

    /**
     * @param  list<string>  $sessionIds
     */
    private function clearLocalSessions(string $subjectId, array $sessionIds): void
    {
        foreach ($sessionIds as $sessionId) {
            $this->registry->clear($sessionId);
            $this->sessions->clear($subjectId, $sessionId);
        }

        $this->sessions->clearSubject($subjectId);
    }

    /**
     * @param  list<string>  $sessionIds
     * @param  list<array<string, mixed>>  $notifications
     */
    private function successResponse(string $sessionId, array $sessionIds, array $notifications, ?string $frontchannelUrl): JsonResponse
    {
        return response()->json(array_filter([
            'signed_out' => true,
            'sid' => $sessionId,
            'sids' => $sessionIds,
            'notifications' => $notifications,
            'frontchannel_logout_url' => $frontchannelUrl,
        ], static fn (mixed $value): bool => $value !== null));
    }

    /**
     * BE-FR043-001: when at least one RP is `frontchannel_pending`,
     * surface the fallback page URL to the SPA so it can redirect to
     * the iframe page on the way out. Bearer-token auth on the
     * fallback endpoint enforces tenant isolation.
     *
     * @param  list<array<string, mixed>>  $notifications
     */
    private function frontchannelFallbackUrl(array $notifications): ?string
    {
        return $this->countByStatus($notifications, 'frontchannel_pending') > 0
            ? rtrim((string) config('sso.issuer', ''), '/').'/connect/logout/frontchannel'
            : null;
    }

    /**
     * @param  list<array<string, mixed>>  $notifications
     */
    private function countByStatus(array $notifications, string $status): int
    {
        return count(array_filter(
            $notifications,
            static fn (array $entry): bool => ($entry['status'] ?? null) === $status,
        ));
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
            $this->upstream->revoke($refreshToken, 'refresh_token');
        } catch (Throwable $exception) {
            Log::warning('[UPSTREAM_REVOCATION_FAILED]', [
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
