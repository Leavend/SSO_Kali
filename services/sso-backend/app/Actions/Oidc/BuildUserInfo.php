<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\OidcIncidentAuditLogger;
use App\Support\Oidc\ClaimsView;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Passport\AccessToken;
use Laravel\Passport\Token;
use RuntimeException;

final class BuildUserInfo
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly OidcIncidentAuditLogger $incidents,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $bearerToken = (string) $request->bearerToken();

        if ($this->looksLikeJwt($bearerToken)) {
            return $this->localUserInfo($request, $bearerToken);
        }

        try {
            $passportUser = Auth::guard('api')->user();
        } catch (\Throwable) {
            $passportUser = null;
        }

        if ($passportUser instanceof User) {
            return response()->json($this->passportUserInfo($passportUser));
        }

        return $this->localUserInfo($request, $bearerToken);
    }

    private function localUserInfo(Request $request, string $token): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom($token);
        } catch (RuntimeException) {
            $this->incidents->record('oidc_userinfo_invalid_token', $request, 'invalid_token');

            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        return response()->json(ClaimsView::userInfo($claims));
    }

    private function looksLikeJwt(string $token): bool
    {
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return false;
        }

        $header = json_decode(base64_decode(strtr($parts[0], '-_', '+/')) ?: '', true);

        return is_array($header)
            && ($header['alg'] ?? null) === (string) config('sso.signing.alg', 'ES256');
    }

    /**
     * @return array<string, mixed>
     */
    private function passportUserInfo(User $user): array
    {
        $scopes = $this->resolvePassportScopes($user);

        // FR-035 / BE-FR035-001: never silently fall back to profile/email
        // for empty Passport scopes. Resource servers must request claims
        // explicitly. We always emit the bare-minimum subject identifier.
        $claims = [
            'sub' => $user->subject_id,
            'scope' => implode(' ', $scopes),
            'name' => $user->display_name,
            'given_name' => $user->given_name,
            'family_name' => $user->family_name,
            'email' => $user->email,
            'email_verified' => $user->email_verified_at !== null,
        ];

        return ClaimsView::userInfo($claims);
    }

    /**
     * @return list<string>
     */
    private function resolvePassportScopes(User $user): array
    {
        $token = $user->token();

        if ($token instanceof Token && is_array($token->scopes)) {
            return array_values(array_filter($token->scopes, 'is_string'));
        }

        if ($token instanceof AccessToken) {
            /** @var mixed $oauthScopes */
            $oauthScopes = $token->oauth_scopes;

            if (! is_array($oauthScopes)) {
                return [];
            }

            return array_values(array_filter($oauthScopes, 'is_string'));
        }

        return [];
    }
}
