<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\OidcIncidentAuditLogger;
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
        private readonly OidcIncidentAuditLogger $incidents,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $clientId = (string) $request->input('client_id', '');
        $client = $this->clients->find($clientId);

        if ($client === null || ! $this->clients->validSecret($client, $this->clientSecret($request))) {
            $reason = $client === null ? 'unknown_client' : 'invalid_secret';

            Log::warning('[REVOCATION_INVALID_CLIENT]', [
                'client_id' => $clientId,
                'reason' => $reason,
                'ip' => $request->ip(),
            ]);

            $this->incidents->record('oidc_revocation_invalid_client', $request, $reason, [
                'client_id' => $clientId,
            ]);

            // RFC 7009 §2.1 — always return 200 regardless of client validity
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
