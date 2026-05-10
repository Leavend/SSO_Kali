<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\OidcIncidentAuditLogger;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\SigningKeyService;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Audit\AuthenticationAuditRecord;
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
        private readonly RecordAuthenticationAuditEventAction $audits,
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

            $this->recordRevocationAudit($request, 'failed', $reason, $clientId, null, [
                'token_type_hint' => $this->tokenTypeHint($request),
                'token_hash' => $this->tokenHash($request),
            ]);

            // RFC 7009 §2.1 — always return 200 regardless of client validity
            return response()->json((object) [], 200);
        }

        $token = (string) $request->input('token', '');
        $hint = is_string($request->input('token_type_hint')) ? $request->input('token_type_hint') : null;

        $refreshResult = $this->revokeRefreshToken($token, $client->clientId, $hint);
        $accessResult = $this->revokeAccessToken($token, $hint);

        $this->recordRevocationAudit($request, 'succeeded', null, $client->clientId, null, [
            'token_type_hint' => $hint,
            'token_class' => $this->tokenClass($token, $hint),
            'token_hash' => hash('sha256', $token),
            'refresh_token_revoked' => $refreshResult['revoked'],
            'access_token_revoked' => $accessResult['revoked'],
            'refresh_token_family_hash' => $refreshResult['family_hash'],
            'access_token_jti_hash' => $accessResult['jti_hash'],
            'idempotent_unknown_token' => ! $refreshResult['revoked'] && ! $accessResult['revoked'],
        ]);

        return response()->json((object) [], 200);
    }

    /**
     * @return array{revoked: bool, family_hash: string|null}
     */
    private function revokeRefreshToken(string $token, string $clientId, ?string $hint): array
    {
        if ($hint !== 'refresh_token' && ! str_starts_with($token, 'rt_')) {
            return ['revoked' => false, 'family_hash' => null];
        }

        $record = $this->refreshTokens->findActive($token, $clientId);

        if ($record === null) {
            return ['revoked' => false, 'family_hash' => null];
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

        return [
            'revoked' => true,
            'family_hash' => is_string($record['token_family_id'] ?? null)
                ? hash('sha256', $record['token_family_id'])
                : null,
        ];
    }

    /**
     * @return array{revoked: bool, jti_hash: string|null}
     */
    private function revokeAccessToken(string $token, ?string $hint): array
    {
        if ($hint === 'refresh_token' || str_starts_with($token, 'rt_')) {
            return ['revoked' => false, 'jti_hash' => null];
        }

        try {
            $claims = $this->keys->decode($token);
        } catch (Throwable) {
            return ['revoked' => false, 'jti_hash' => null];
        }

        $jti = is_string($claims['jti'] ?? null) ? $claims['jti'] : null;
        $ttl = max(1, (int) ($claims['exp'] ?? time()) - time());

        if ($jti === null) {
            return ['revoked' => false, 'jti_hash' => null];
        }

        $this->revocations->revoke($jti, $ttl);

        return ['revoked' => true, 'jti_hash' => hash('sha256', $jti)];
    }

    private function clientSecret(Request $request): ?string
    {
        $secret = $request->input('client_secret');

        return is_string($secret) ? $secret : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function recordRevocationAudit(
        Request $request,
        string $outcome,
        ?string $errorCode,
        ?string $clientId,
        ?string $sessionId,
        array $context,
    ): void {
        $this->audits->execute(AuthenticationAuditRecord::tokenLifecycle(
            eventType: 'token_revoked',
            outcome: $outcome,
            subjectId: null,
            clientId: $clientId,
            sessionId: $sessionId,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: $errorCode,
            requestId: $request->headers->get('X-Request-Id'),
            context: array_filter($context, static fn (mixed $value): bool => $value !== null),
        ));
    }

    private function tokenTypeHint(Request $request): ?string
    {
        $hint = $request->input('token_type_hint');

        return is_string($hint) && $hint !== '' ? $hint : null;
    }

    private function tokenHash(Request $request): ?string
    {
        $token = $request->input('token');

        return is_string($token) && $token !== '' ? hash('sha256', $token) : null;
    }

    private function tokenClass(string $token, ?string $hint): string
    {
        if ($hint === 'refresh_token' || str_starts_with($token, 'rt_')) {
            return 'refresh_token';
        }

        if ($hint === 'access_token') {
            return 'access_token';
        }

        return 'unknown';
    }
}
