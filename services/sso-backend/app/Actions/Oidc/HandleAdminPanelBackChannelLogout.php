<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\LocalLogoutTokenVerifier;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\RefreshTokenStore;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class HandleAdminPanelBackChannelLogout
{
    public function __construct(
        private readonly LocalLogoutTokenVerifier $tokens,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly AccessTokenRevocationStore $revocations,
        private readonly LogicalSessionStore $sessions,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $claims = $this->claims($request);

        if ($claims === null) {
            return OidcErrorResponse::json('invalid_request', 'The logout token is invalid.', 400);
        }

        $records = $this->revokedRecords($claims);
        $this->revokeAccessTokens($records);
        $this->clearLogicalSessions((string) ($claims['sub'] ?? ''), $records);

        return response()->json([
            'logged_out' => true,
            'client_id' => $this->adminClientId(),
            'sessions_revoked' => count($records),
        ]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function claims(Request $request): ?array
    {
        $token = $request->input('logout_token');

        if (! is_string($token) || $token === '') {
            return null;
        }

        try {
            return $this->tokens->verify($token, $this->adminClientId());
        } catch (RuntimeException) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return list<array<string, mixed>>
     */
    private function revokedRecords(array $claims): array
    {
        $subjectId = is_string($claims['sub'] ?? null) ? $claims['sub'] : null;

        if ($subjectId !== null && $subjectId !== '') {
            return $this->refreshTokens->revokeClientSessionsForSubject($subjectId, $this->adminClientId());
        }

        return $this->refreshTokens->revokeClientSession((string) $claims['sid'], $this->adminClientId());
    }

    /**
     * @param  list<array<string, mixed>>  $records
     */
    private function revokeAccessTokens(array $records): void
    {
        foreach ($records as $record) {
            $this->revocations->revokeSession((string) $record['session_id']);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $records
     */
    private function clearLogicalSessions(string $subjectId, array $records): void
    {
        if ($subjectId === '') {
            return;
        }

        foreach ($records as $record) {
            $this->sessions->clear($subjectId, (string) $record['session_id']);
        }
    }

    private function adminClientId(): string
    {
        return (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}
