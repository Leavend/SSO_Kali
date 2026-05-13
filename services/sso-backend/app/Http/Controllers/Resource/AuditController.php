<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AuditController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
    ) {}

    /**
     * GET /api/profile/audit — list recent security events for authenticated user.
     *
     * Query params:
     *   - event: filter by event_type (optional)
     *   - limit: max results (default 10, max 50)
     */
    public function __invoke(Request $request): JsonResponse
    {
        $session = $this->sessionService->current($this->cookies->resolve($request));
        if (! $session) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = DB::table('users')->where('id', $session->user_id)->first(['subject_id']);
        if (! $user) {
            return response()->json(['message' => 'Pengguna tidak ditemukan.'], 404);
        }

        $limit = min((int) $request->query('limit', '10'), 50);
        $eventFilter = $request->query('event');

        $query = DB::table('authentication_audit_events')
            ->where('subject_id', $user->subject_id)
            ->orderByDesc('occurred_at')
            ->limit($limit);

        if (is_string($eventFilter) && $eventFilter !== '') {
            $query->where('event_type', $eventFilter);
        }

        $events = $query->get()->map(fn (object $row) => [
            'id' => $row->event_id,
            'event' => self::mapEventType((string) $row->event_type),
            'ip_address' => $row->ip_address,
            'user_agent' => $row->user_agent,
            'created_at' => str_replace(' ', 'T', (string) $row->occurred_at).'Z',
            'metadata' => array_filter([
                'outcome' => $row->outcome,
                'client_id' => $row->client_id,
                'session_id' => $row->session_id,
            ], fn (mixed $v): bool => $v !== null),
        ]);

        return response()->json([
            'events' => $events,
            'total' => $events->count(),
        ]);
    }

    /**
     * Map internal event_type to frontend AuditEventType enum.
     */
    private static function mapEventType(string $type): string
    {
        return match ($type) {
            'login_succeeded', 'login_failed' => 'login',
            'logout_succeeded', 'logout_completed' => 'logout',
            'logout_all_sessions' => 'logout_all',
            'session_revoked' => 'session_revoked',
            'token_refreshed' => 'token_refreshed',
            'password_changed' => 'password_changed',
            'profile_updated' => 'profile_updated',
            'connected_app_revoked' => 'connected_app_revoked',
            default => $type,
        };
    }
}
