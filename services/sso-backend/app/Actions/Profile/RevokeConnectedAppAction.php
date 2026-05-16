<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Admin\AdminAuditEventStore;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Profile\ProfilePrincipalException;
use App\Services\Profile\ProfilePrincipalResolver;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RevokeConnectedAppAction
{
    public function __construct(
        private readonly ProfilePrincipalResolver $principals,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly AccessTokenRevocationStore $accessTokens,
        private readonly ConsentService $consents,
        private readonly AdminAuditEventStore $audits,
    ) {}

    public function handle(Request $request, string $clientId): JsonResponse
    {
        try {
            $principal = $this->principals->resolve($request);
        } catch (ProfilePrincipalException $e) {
            return OidcErrorResponse::json($e->errorCode, $e->getMessage(), $e->statusCode);
        }
        $claims = $principal['claims'];

        $revoked = $this->refreshTokens->revokeClientSessionsForSubject((string) $claims['sub'], $clientId);
        $this->accessTokens->revokeSubjectClient((string) $claims['sub'], $clientId);
        $this->consents->revoke((string) $claims['sub'], $clientId);
        $this->audit($request, $claims, $clientId, count($revoked));

        return response()->json([
            'client_id' => $clientId,
            'revoked' => true,
            'revoked_refresh_tokens' => count($revoked),
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function audit(Request $request, array $claims, string $clientId, int $revoked): void
    {
        $this->audits->append([
            'taxonomy' => 'profile.connected_app_revoked',
            'action' => 'profile.connected_app.revoke',
            'outcome' => 'success',
            'admin_subject_id' => (string) $claims['sub'],
            'admin_email' => null,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_revocation',
            'context' => [
                'client_id' => $clientId,
                'revoked_refresh_tokens' => $revoked,
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
        ]);
    }
}
