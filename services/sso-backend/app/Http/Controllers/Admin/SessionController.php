<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminSessionPresenter;
use App\Services\Admin\AdminSessionService;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SessionController
{
    public function __construct(
        private readonly AdminSessionService $sessions,
        private readonly AdminSessionPresenter $presenter,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok(['sessions' => $this->sessions->activeSessions()]);
    }

    public function show(string $sessionId): JsonResponse
    {
        $session = $this->presenter->find($this->sessions->activeSessions(), $sessionId);

        return $session === null
            ? AdminApiResponse::error('not_found', 'Session not found.', 404)
            : AdminApiResponse::ok(['session' => $session]);
    }

    public function destroy(Request $request, string $sessionId): JsonResponse
    {
        return $this->run($request, 'revoke_session', ['session_id' => $sessionId], fn (): array => $this->sessions->revokeSession($sessionId), 'Failed to revoke session.');
    }

    public function destroyUserSessions(Request $request, string $subjectId): JsonResponse
    {
        return $this->run($request, 'revoke_all_user_sessions', ['subject_id' => $subjectId], fn (): array => $this->sessions->revokeAllUserSessions($subjectId), 'Failed to revoke user sessions.');
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  \Closure(): array<string, mixed>  $callback
     */
    private function run(Request $request, string $action, array $context, \Closure $callback, string $failureMessage): JsonResponse
    {
        return $this->mutations->runWithAuditResult(
            $request,
            $action,
            $context,
            fn (): array => $this->presenter->revoked($context, $callback()),
            $failureMessage,
        );
    }
}
