<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class RegisterClientSession
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly DownstreamClientRegistry $clients,
        private readonly BackChannelSessionRegistry $registry,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $claims = $this->claims($request);
        $sessionId = is_string($claims['sid'] ?? null) ? $claims['sid'] : null;
        $clientId = is_string($claims['client_id'] ?? null) ? $claims['client_id'] : null;

        if ($sessionId === null || $clientId === null) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        $client = $this->clients->find($clientId);

        if ($client?->backchannelLogoutUri === null) {
            return OidcErrorResponse::json('invalid_client', 'Client is missing a back-channel logout URI.', 400);
        }

        $this->registry->register($sessionId, $clientId, $client->backchannelLogoutUri);

        return response()->json([
            'registered' => true,
            'client_id' => $clientId,
            'sid' => $sessionId,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function claims(Request $request): array
    {
        try {
            return $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return [];
        }
    }
}
