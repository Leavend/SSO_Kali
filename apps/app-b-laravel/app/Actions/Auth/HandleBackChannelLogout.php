<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Sso\AppSessionStore;
use App\Services\Sso\LogoutTokenVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class HandleBackChannelLogout
{
    public function __construct(
        private readonly LogoutTokenVerifier $verifier,
        private readonly AppSessionStore $sessions,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $token = (string) $request->input('logout_token', '');

        if ($token === '') {
            return response()->json(['error' => 'logout_token is required'], 400);
        }

        try {
            $claims = $this->verifier->claims($token);
            $sid = is_string($claims['sid'] ?? null) ? $claims['sid'] : null;

            if ($sid === null || $sid === '') {
                return response()->json(['error' => 'logout sid is required'], 401);
            }

            $cleared = $this->sessions->destroyBySid($sid);
        } catch (RuntimeException) {
            return response()->json(['error' => 'invalid logout token'], 401);
        }

        return response()->json(['cleared' => $cleared, 'sid' => $sid]);
    }
}
