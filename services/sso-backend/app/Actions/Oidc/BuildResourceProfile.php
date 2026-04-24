<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Support\Oidc\ClaimsView;
use App\Support\Responses\OidcErrorResponse;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class BuildResourceProfile
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

        $user = User::query()->where('subject_id', (string) $claims['sub'])->firstOrFail();
        $loginContext = DB::table('login_contexts')->where('subject_id', $user->subject_id)->first();

        return response()->json([
            'user' => ClaimsView::userInfo($claims),
            'resource_profile' => [
                'subject_id' => $user->subject_id,
                'email' => $user->email,
                'display_name' => $user->display_name,
                'last_login_at' => $user->last_login_at === null
                    ? null
                    : Carbon::parse((string) $user->last_login_at)->toIso8601String(),
                'login_context' => [
                    'risk_score' => $loginContext->risk_score ?? 0,
                    'mfa_required' => (bool) ($loginContext->mfa_required ?? false),
                ],
            ],
        ]);
    }
}
