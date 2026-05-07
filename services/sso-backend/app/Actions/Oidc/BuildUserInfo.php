<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Support\Oidc\ClaimsView;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Passport\Token;
use RuntimeException;

final class BuildUserInfo
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $passportUser = Auth::guard('api')->user();
        } catch (\Throwable) {
            $passportUser = null;
        }

        if ($passportUser instanceof User) {
            return response()->json($this->passportUserInfo($passportUser));
        }

        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        return response()->json(ClaimsView::userInfo($claims));
    }

    /**
     * @return array<string, mixed>
     */
    private function passportUserInfo(User $user): array
    {
        $token = $user->token();
        $scopes = $token instanceof Token && is_array($token->scopes) ? $token->scopes : [];
        if ($scopes === []) {
            $scopes = ['openid', 'profile', 'email'];
        }

        $claims = [
            'sub' => $user->subject_id,
            'scope' => implode(' ', is_array($scopes) ? $scopes : []),
            'name' => $user->display_name,
            'given_name' => $user->given_name,
            'family_name' => $user->family_name,
            'email' => $user->email,
            'email_verified' => $user->email_verified_at !== null,
        ];

        return ClaimsView::userInfo($claims);
    }
}
