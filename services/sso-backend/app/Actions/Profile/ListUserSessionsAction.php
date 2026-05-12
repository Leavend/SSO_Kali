<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Services\Oidc\AccessTokenGuard;
use App\Services\Profile\UserSessionsService;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ListUserSessionsAction
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly UserSessionsService $sessions,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        return response()->json([
            'sessions' => $this->sessions->listForSubject((string) $claims['sub']),
        ])->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
