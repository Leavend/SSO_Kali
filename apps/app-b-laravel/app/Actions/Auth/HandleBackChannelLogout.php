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
            return $this->handleClaims($this->verifier->claims($token));
        } catch (RuntimeException) {
            return response()->json(['error' => 'invalid logout token'], 401);
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function handleClaims(array $claims): JsonResponse
    {
        $sid = $this->stringClaim($claims, 'sid');
        $subject = $this->stringClaim($claims, 'sub');

        if ($sid === null && $subject === null) {
            return response()->json(['error' => 'logout subject or sid is required'], 401);
        }

        return response()->json($this->logoutPayload($sid, $subject));
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function stringClaim(array $claims, string $key): ?string
    {
        $value = $claims[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function clearSessions(?string $sid, ?string $subject): int
    {
        $cleared = $sid === null ? 0 : $this->sessions->destroyBySid($sid);

        return $cleared + ($subject === null ? 0 : $this->sessions->destroyBySubject($subject));
    }

    /**
     * @return array{cleared: int, sid: string, sub: string|null}
     */
    private function logoutPayload(?string $sid, ?string $subject): array
    {
        return [
            'cleared' => $this->clearSessions($sid, $subject),
            'sid' => $sid ?? '',
            'sub' => $subject,
        ];
    }
}
