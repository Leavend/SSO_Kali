<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginSsoUserAction;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class LoginController
{
    public function __invoke(
        LoginRequest $request,
        LoginSsoUserAction $login,
        SsoSessionCookieFactory $cookies,
    ): JsonResponse {
        $result = $login->execute(
            (string) $request->validated('identifier'),
            (string) $request->validated('password'),
            $request->ip(),
            $request->userAgent(),
        );

        if (! $result->authenticated || $result->user === null || $result->session === null) {
            // Record failed login audit event
            $this->recordAuditEvent(
                eventType: 'sso_login_failed',
                outcome: 'failed',
                subjectId: null,
                email: (string) $request->validated('identifier'),
                sessionId: null,
                ipAddress: $request->ip(),
                userAgent: $request->userAgent(),
                errorCode: $result->error ?? 'invalid_credentials',
                context: ['identifier_hash' => hash('sha256', (string) $request->validated('identifier'))],
            );

            return response()->json([
                'authenticated' => false,
                'error' => $result->error,
                'message' => 'The supplied credentials are invalid.',
            ], 401);
        }

        // Record successful login audit event
        $this->recordAuditEvent(
            eventType: 'sso_login_success',
            outcome: 'success',
            subjectId: $result->user->subjectId,
            email: $result->user->email,
            sessionId: $result->session->session_id,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: null,
            context: ['session_ttl_minutes' => (int) config('sso.session.ttl_minutes', 480)],
        );

        return response()->json([
            'authenticated' => true,
            'user' => $result->user->toArray(),
            'session' => ['expires_at' => $result->session->expires_at->toIso8601String()],
            'next' => [
                'type' => $request->validated('auth_request_id') !== null ? 'continue_authorize' : 'session',
                'auth_request_id' => $request->validated('auth_request_id'),
            ],
        ])->withCookie($cookies->make($result->session->session_id));
    }

    private function recordAuditEvent(
        string $eventType,
        string $outcome,
        ?string $subjectId,
        ?string $email,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode,
        array $context = [],
    ): void {
        DB::table('authentication_audit_events')->insert([
            'event_id' => (string) Str::ulid(),
            'event_type' => $eventType,
            'outcome' => $outcome,
            'subject_id' => $subjectId,
            'email' => $email,
            'client_id' => null,
            'session_id' => $sessionId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'error_code' => $errorCode,
            'request_id' => (string) Str::uuid(),
            'context' => json_encode($context),
            'occurred_at' => now(),
            'created_at' => now(),
        ]);
    }
}
