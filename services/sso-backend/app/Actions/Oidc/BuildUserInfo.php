<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenGuard;
use App\Support\Oidc\ClaimsView;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class BuildUserInfo
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        return response()->json(ClaimsView::userInfo($claims));
    }
}
