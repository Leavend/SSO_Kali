<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginSsoUserAction;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\Session\SsoSessionCookieFactory;
use Illuminate\Http\JsonResponse;

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
            $this->optionalString($request->validated('auth_request_id')),
            $request->headers->get('X-Request-Id'),
        );

        if (! $result->authenticated || $result->user === null || $result->session === null) {
            return response()->json([
                'authenticated' => false,
                'error' => $result->error,
                'message' => 'The supplied credentials are invalid.',
            ], 401);
        }

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

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
