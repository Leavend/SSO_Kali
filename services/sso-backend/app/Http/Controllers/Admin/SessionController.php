<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class SessionController
{
    public function __construct(
        private readonly AdminSessionService $sessions,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json(['sessions' => $this->sessions->activeSessions()]);
    }

    public function show(string $sessionId): JsonResponse
    {
        $sessions = collect($this->sessions->activeSessions())
            ->filter(fn (array $s): bool => $s['session_id'] === $sessionId)
            ->values();

        if ($sessions->isEmpty()) {
            return response()->json(['error' => 'Session not found.'], 404);
        }

        return response()->json(['session' => $sessions->first()]);
    }

    public function destroy(Request $request, string $sessionId): JsonResponse
    {
        return $this->runAction(
            $request,
            'revoke_session',
            ['session_id' => $sessionId],
            fn (): array => $this->sessions->revokeSession($sessionId),
        );
    }

    public function destroyUserSessions(Request $request, string $subjectId): JsonResponse
    {
        return $this->runAction(
            $request,
            'revoke_all_user_sessions',
            ['subject_id' => $subjectId],
            fn (): array => $this->sessions->revokeAllUserSessions($subjectId),
        );
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  \Closure(): array<string, mixed>  $callback
     */
    private function runAction(Request $request, string $action, array $context, \Closure $callback): JsonResponse
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        try {
            $result = $callback();
        } catch (Throwable $exception) {
            $this->audit->failed(
                $action,
                $request,
                $admin,
                $exception,
                [...$context, 'freshness_level' => 'step_up'],
                AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
            );

            return response()->json([
                'error' => str_contains($action, 'all') ? 'Failed to revoke user sessions.' : 'Failed to revoke session.',
                'detail' => app()->isLocal() ? $exception->getMessage() : null,
            ], 500);
        }

        $this->audit->succeeded(
            $action,
            $request,
            $admin,
            [...$context, ...$result, 'freshness_level' => 'step_up'],
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );

        return response()->json([
            'revoked' => true,
            ...$context,
            ...$result,
        ]);
    }
}
