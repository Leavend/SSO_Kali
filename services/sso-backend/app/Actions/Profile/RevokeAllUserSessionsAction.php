<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Admin\AdminAuditEventStore;
use App\Services\Admin\AdminSessionService;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Profile\UserSessionsService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class RevokeAllUserSessionsAction
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly AdminSessionService $sessionService,
        private readonly LogicalSessionStore $logicalSessions,
        private readonly UserSessionsService $sessions,
        private readonly AdminAuditEventStore $audits,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        $subjectId = (string) $claims['sub'];
        $activeSessions = $this->sessions->listForSubject($subjectId);
        $revokedSessions = 0;
        $revokedRefreshTokens = 0;

        foreach ($activeSessions as $session) {
            $sessionId = (string) $session['session_id'];
            $result = $this->sessionService->revokeSession($sessionId);
            $this->logicalSessions->clear($subjectId, $sessionId);
            $revokedSessions++;
            $revokedRefreshTokens += (int) $result['revoked_tokens'];
        }

        $this->audit($request, $subjectId, $revokedSessions, $revokedRefreshTokens);

        return response()->json([
            'revoked' => true,
            'revoked_sessions' => $revokedSessions,
            'revoked_refresh_tokens' => $revokedRefreshTokens,
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }

    private function audit(Request $request, string $subjectId, int $revokedSessions, int $revokedRefreshTokens): void
    {
        $this->audits->append([
            'taxonomy' => 'profile.sessions_revoked_all',
            'action' => 'profile.sessions.revoke_all',
            'outcome' => 'success',
            'admin_subject_id' => $subjectId,
            'admin_email' => null,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_logout_everywhere',
            'context' => [
                'revoked_sessions' => $revokedSessions,
                'revoked_refresh_tokens' => $revokedRefreshTokens,
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
        ]);
    }
}
