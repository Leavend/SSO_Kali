<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\User;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Profile\ProfilePortalPresenter;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ShowProfilePortalAction
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly ProfilePortalPresenter $profiles,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        return $this->noStore(response()->json(
            $this->profiles->present($this->user($claims), $claims),
        ));
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function user(array $claims): User
    {
        return User::query()->where('subject_id', (string) $claims['sub'])->firstOrFail();
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        return $response->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
