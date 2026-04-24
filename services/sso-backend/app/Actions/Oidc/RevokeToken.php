<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\SigningKeyService;
use App\Services\Zitadel\ZitadelBrokerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

final class RevokeToken
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly SigningKeyService $keys,
        private readonly AccessTokenRevocationStore $revocations,
        private readonly ZitadelBrokerService $broker,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $client = $this->clients->find((string) $request->input('client_id', ''));

        if ($client === null || ! $this->clients->validSecret($client, $this->clientSecret($request))) {
            return response()->json((object) [], 200);
        }

        $token = (string) $request->input('token', '');
        $hint = is_string($request->input('token_type_hint')) ? $request->input('token_type_hint') : null;

        $this->revokeRefreshToken($token, $client->clientId, $hint);
        $this->revokeAccessToken($token, $hint);

        return response()->json((object) [], 200);
    }

    private function revokeRefreshToken(string $token, string $clientId, ?string $hint): void
    {
        if ($hint !== 'refresh_token' && ! str_starts_with($token, 'rt_')) {
            return;
        }

        $record = $this->refreshTokens->findActive($token, $clientId);

        if ($record === null) {
            return;
        }

        $this->refreshTokens->revoke((string) $record['refresh_token_id']);

        try {
            is_string($record['upstream_refresh_token'] ?? null)
                && $this->broker->revoke((string) $record['upstream_refresh_token'], 'refresh_token');
        } catch (Throwable $exception) {
            Log::warning('[UPSTREAM_REVOCATION_FAILED]', [
                'error' => $exception->getMessage(),
                'client_id' => $clientId,
            ]);
        }
    }

    private function revokeAccessToken(string $token, ?string $hint): void
    {
        if ($hint === 'refresh_token' || str_starts_with($token, 'rt_')) {
            return;
        }

        try {
            $claims = $this->keys->decode($token);
        } catch (Throwable) {
            return;
        }

        $jti = is_string($claims['jti'] ?? null) ? $claims['jti'] : null;
        $ttl = max(1, (int) ($claims['exp'] ?? time()) - time());

        $jti !== null && $this->revocations->revoke($jti, $ttl);
    }

    private function clientSecret(Request $request): ?string
    {
        $secret = $request->input('client_secret');

        return is_string($secret) ? $secret : null;
    }
}
