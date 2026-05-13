<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Admin\AdminAuditEventStore;
use App\Services\Admin\AdminSessionService;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Services\Profile\UserSessionsService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RevokeUserSessionAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly AdminSessionService $sessionService,
        private readonly LogicalSessionStore $logicalSessions,
        private readonly UserSessionsService $sessions,
        private readonly AdminAuditEventStore $audits,
    ) {}

    public function handle(Request $request, string $sessionId): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), 401);
        }

        $subjectId = (string) $principal['claims']['sub'];

        if (! $this->sessions->belongsToSubject($subjectId, $sessionId)) {
            return OidcErrorResponse::json('session_not_found', 'Session does not belong to this user.', 404);
        }

        $result = $this->sessionService->revokeSession($sessionId);
        $this->sessions->revokePortalSession($sessionId);
        $this->logicalSessions->clear($subjectId, $sessionId);
        $this->audit($request, $subjectId, $sessionId, $result);

        return response()->json([
            'session_id' => $sessionId,
            'revoked' => true,
            'revoked_refresh_tokens' => $result['revoked_tokens'],
            'backchannel_fanout' => $result['backchannel_fanout'],
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * @param  array{revoked_tokens: int, backchannel_fanout: int}  $result
     */
    private function audit(Request $request, string $subjectId, string $sessionId, array $result): void
    {
        $this->audits->append([
            'taxonomy' => 'profile.session_revoked',
            'action' => 'profile.session.revoke',
            'outcome' => 'success',
            'admin_subject_id' => $subjectId,
            'admin_email' => null,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_session_revocation',
            'context' => [
                'session_id' => $sessionId,
                'revoked_refresh_tokens' => $result['revoked_tokens'],
                'backchannel_fanout' => $result['backchannel_fanout'],
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
        ]);
    }
}
