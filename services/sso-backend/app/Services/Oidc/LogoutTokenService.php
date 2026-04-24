<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use Illuminate\Support\Str;

final class LogoutTokenService
{
    public function __construct(
        private readonly SigningKeyService $keys,
    ) {}

    public function issue(string $clientId, string $subjectId, string $sessionId): string
    {
        return $this->keys->sign([
            'iss' => config('sso.issuer'),
            'aud' => $clientId,
            'sub' => $subjectId,
            'sid' => $sessionId,
            'iat' => time(),
            'exp' => time() + 120, // OIDC BCL §2.4 — logout tokens MUST have exp
            'jti' => (string) Str::uuid(),
            'events' => [
                'http://schemas.openid.net/event/backchannel-logout' => (object) [],
            ],
        ]);
    }
}
