<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LogoutSsoSessionAction;
use App\Models\SsoSession;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionCookieResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class LogoutController
{
    public function __invoke(
        Request $request,
        LogoutSsoSessionAction $logout,
        SsoSessionCookieResolver $resolver,
        SsoSessionCookieFactory $cookies,
    ): JsonResponse {
        $sessionId = $resolver->resolve($request);

        // Get session info before logout for audit
        $session = $sessionId ? SsoSession::where('session_id', $sessionId)->first() : null;
        if ($session) {
            $user = DB::table('users')->where('id', $session->user_id)->first(['subject_id', 'email']);

            // Record logout audit event
            DB::table('authentication_audit_events')->insert([
                'event_id' => (string) Str::ulid(),
                'event_type' => 'sso_logout_success',
                'outcome' => 'success',
                'subject_id' => $user?->subject_id,
                'email' => $user?->email,
                'client_id' => null,
                'session_id' => $sessionId,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'error_code' => null,
                'request_id' => (string) Str::uuid(),
                'context' => json_encode(['logout_channel' => 'portal']),
                'occurred_at' => now(),
                'created_at' => now(),
            ]);
        }

        $logout->execute($sessionId);

        return response()
            ->json(['authenticated' => false])
            ->withCookie($cookies->forget());
    }
}
