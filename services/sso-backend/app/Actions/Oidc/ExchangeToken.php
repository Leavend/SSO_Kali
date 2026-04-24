<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Oidc\UserProfileSynchronizer;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\Pkce;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class ExchangeToken
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AuthorizationCodeStore $codes,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly LocalTokenService $tokens,
        private readonly ZitadelBrokerService $broker,
        private readonly UserProfileSynchronizer $profiles,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        return match ((string) $request->input('grant_type', '')) {
            'authorization_code' => $this->authorizationCodeGrant($request),
            'refresh_token' => $this->refreshGrant($request),
            default => OidcErrorResponse::json('unsupported_grant_type', 'The requested grant type is not supported.', 400),
        };
    }

    private function authorizationCodeGrant(Request $request): JsonResponse
    {
        $payload = $this->codes->pull((string) $request->input('code', ''));
        $client = $this->clientForCode($request, $payload);

        if ($payload === null || $client === null) {
            return OidcErrorResponse::json('invalid_grant', 'The authorization code is invalid.', 400);
        }

        if (! $this->clients->validSecret($client, $this->clientSecret($request))) {
            return OidcErrorResponse::json('invalid_client', 'Client authentication failed.', 401);
        }

        if (! $this->validPkce($request, $payload)) {
            return OidcErrorResponse::json('invalid_grant', 'PKCE verification failed.', 400);
        }

        return response()->json($this->tokens->issue($payload));
    }

    private function refreshGrant(Request $request): JsonResponse
    {
        $client = $this->clients->find((string) $request->input('client_id', ''));

        if ($client === null || ! $this->clients->validSecret($client, $this->clientSecret($request))) {
            return OidcErrorResponse::json('invalid_client', 'Client authentication failed.', 401);
        }

        $record = $this->refreshTokens->findActive((string) $request->input('refresh_token', ''), $client->clientId);

        if ($record === null) {
            return OidcErrorResponse::json('invalid_grant', 'The refresh token is invalid.', 400);
        }

        return $this->rotatedTokens($request, $record);
    }

    /**
     * @param  array<string, mixed>|null  $payload
     */
    private function clientForCode(Request $request, ?array $payload): ?DownstreamClient
    {
        if ($payload === null) {
            return null;
        }

        $client = $this->clients->resolve(
            (string) $request->input('client_id', ''),
            (string) $request->input('redirect_uri', ''),
        );

        if ($client?->clientId !== ($payload['client_id'] ?? null)) {
            return null;
        }

        // OAuth 2.1 §4.1.3 — redirect_uri MUST match the value used in the authorization request
        $requestedRedirectUri = (string) $request->input('redirect_uri', '');
        $storedRedirectUri = (string) ($payload['redirect_uri'] ?? '');

        if ($storedRedirectUri !== '' && $requestedRedirectUri !== $storedRedirectUri) {
            return null;
        }

        return $client;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function validPkce(Request $request, array $payload): bool
    {
        return Pkce::matches(
            (string) $request->input('code_verifier', ''),
            (string) $payload['downstream_code_challenge'],
        );
    }

    /**
     * @param  array<string, mixed>  $record
     */
    private function rotatedTokens(Request $request, array $record): JsonResponse
    {
        $context = $this->refreshContext($record);

        if (! is_string($record['upstream_refresh_token'] ?? null)) {
            return response()->json($this->tokens->rotate($record, $context));
        }

        $upstream = $this->upstreamRefreshContext($request, $record, $context);

        return $upstream ?? OidcErrorResponse::json('invalid_grant', 'The upstream refresh token is no longer valid.', 400);
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  array<string, mixed>  $context
     */
    private function upstreamRefreshContext(Request $request, array $record, array $context): ?JsonResponse
    {
        try {
            $upstream = $this->broker->token($this->refreshPayload((string) $record['upstream_refresh_token']));
            $claims = $this->broker->userInfo((string) $upstream['access_token']);
        } catch (Throwable) {
            return null;
        }

        $authContext = $this->refreshAuthContext($record);
        $user = $this->profiles->sync($claims, [
            ...$this->riskContext($request),
            ...$authContext,
        ]);

        return response()->json($this->tokens->rotate($record, [
            ...$context,
            ...$authContext,
            'subject_id' => $user->subject_id,
            'upstream_refresh_token' => $upstream['refresh_token'] ?? $record['upstream_refresh_token'],
        ]));
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>
     */
    private function refreshContext(array $record): array
    {
        return [
            'client_id' => $record['client_id'],
            'scope' => $record['scope'],
            'session_id' => $record['session_id'],
            'subject_id' => $record['subject_id'],
            'auth_time' => $record['auth_time'] ?? null,
            'amr' => $record['amr'] ?? [],
            'acr' => $record['acr'] ?? null,
            'upstream_refresh_token' => $record['upstream_refresh_token'],
        ];
    }

    /**
     * @return array<string, string>
     */
    private function refreshPayload(string $refreshToken): array
    {
        return [
            'grant_type' => 'refresh_token',
            'client_id' => (string) config('sso.broker.client_id'),
            'client_secret' => (string) config('sso.broker.client_secret'),
            'refresh_token' => $refreshToken,
        ];
    }

    /**
     * @return array<string, string|null>
     */
    private function riskContext(Request $request): array
    {
        return [
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'device_fingerprint' => $request->header('X-Device-Fingerprint'),
        ];
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>
     */
    private function refreshAuthContext(array $record): array
    {
        return [
            'auth_time' => $record['auth_time'] ?? null,
            'amr' => $record['amr'] ?? [],
            'acr' => $record['acr'] ?? null,
        ];
    }

    private function clientSecret(Request $request): ?string
    {
        $secret = $request->input('client_secret');

        return is_string($secret) ? $secret : null;
    }
}
