<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\User;
use App\Support\Oidc\ScopeSet;
use Illuminate\Support\Str;

final class LocalTokenService
{
    public function __construct(
        private readonly SigningKeyService $keys,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly UserClaimsFactory $claims,
        private readonly AccessTokenRevocationStore $revocations,
        private readonly DownstreamClientRegistry $clients,
        private readonly BackChannelSessionRegistry $backChannelSessions,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function issue(array $context): array
    {
        $user = $this->user((string) $context['subject_id']);
        $tokens = $this->signedTokens($user, $context);
        $this->registerBackChannelSession((string) $context['client_id'], (string) $context['session_id'], $context);

        $response = [
            ...$tokens,
            'token_type' => 'Bearer',
            'expires_in' => (int) config('sso.ttl.access_token_minutes', 15) * 60,
            'scope' => (string) $context['scope'],
        ];

        if ($this->shouldIssueRefreshToken($context)) {
            $refresh = $this->refreshTokens->issue(
                subjectId: $user->subject_id,
                clientId: (string) $context['client_id'],
                scope: (string) $context['scope'],
                sessionId: (string) $context['session_id'],
                upstreamRefreshToken: is_string($context['upstream_refresh_token'] ?? null)
                    ? $context['upstream_refresh_token']
                    : null,
                authTime: $this->authTime($context),
                amr: $this->amr($context),
                acr: $this->acr($context),
            );
            $response['refresh_token'] = $refresh['token'];
        }

        return $response;
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function rotate(array $record, array $context): array
    {
        // BE-FR032-001 — atomic CAS-backed rotation. Concurrent calls
        // race on the row UPDATE inside the transaction; the loser
        // raises RefreshTokenRotationConflict and the caller MUST map
        // that to an `invalid_grant` token endpoint response.
        $refresh = $this->refreshTokens->rotateAtomic($record, $context);

        $user = $this->user((string) $record['subject_id']);
        $tokens = $this->signedTokens($user, $context);

        $this->registerBackChannelSession((string) $record['client_id'], (string) $record['session_id'], $record);

        return [
            ...$tokens,
            'refresh_token' => $refresh['token'],
            'token_type' => 'Bearer',
            'expires_in' => (int) config('sso.ttl.access_token_minutes', 15) * 60,
            'scope' => (string) $record['scope'],
        ];
    }

    private function user(string $subjectId): User
    {
        return User::query()->where('subject_id', $subjectId)->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    private function signedTokens(User $user, array $context): array
    {
        $accessClaims = $this->claims->accessTokenClaims($user, $context, (string) Str::uuid());
        $accessToken = $this->keys->sign($accessClaims);
        $idToken = $this->keys->sign(
            $this->claims->idTokenClaims($user, $context, (string) Str::uuid()),
        );

        $this->revocations->track(
            (string) $context['session_id'],
            (string) $accessClaims['jti'],
            (int) $accessClaims['exp'],
            (string) $context['client_id'],
            (string) $user->subject_id,
        );

        return [
            'access_token' => $accessToken,
            'id_token' => $idToken,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function authTime(array $context, ?int $fallback = null): int
    {
        return is_int($context['auth_time'] ?? null)
            ? $context['auth_time']
            : ($fallback ?? now()->timestamp);
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  list<string>  $fallback
     * @return list<string>
     */
    private function amr(array $context, array $fallback = []): array
    {
        $amr = array_values(array_filter(
            is_array($context['amr'] ?? null) ? $context['amr'] : $fallback,
            static fn (mixed $value): bool => is_string($value) && $value !== '',
        ));

        return $amr;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function acr(array $context, ?string $fallback = null): ?string
    {
        $acr = $context['acr'] ?? $fallback;

        return is_string($acr) && $acr !== '' ? $acr : null;
    }

    /**
     * OAuth 2.1 §3.1 — Refresh tokens SHOULD only be issued when the
     * downstream client requests the offline_access scope and an upstream
     * refresh token is available to maintain the token chain.
     *
     * @param  array<string, mixed>  $context
     */
    private function shouldIssueRefreshToken(array $context): bool
    {
        $scope = ScopeSet::fromString((string) ($context['scope'] ?? ''));
        $clientId = $context['client_id'] ?? null;
        $client = is_string($clientId) ? $this->clients->find($clientId) : null;

        return ScopeSet::contains($scope, 'offline_access')
            && $client !== null
            && ScopeSet::contains($client->allowedScopes, 'offline_access');
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function registerBackChannelSession(string $clientId, string $sessionId, array $context): void
    {
        $client = $this->clients->find($clientId);

        if ($client?->backchannelLogoutUri === null) {
            return;
        }

        $this->backChannelSessions->register(
            $sessionId,
            $clientId,
            $client->backchannelLogoutUri,
            $this->backChannelMetadata($context),
        );
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function backChannelMetadata(array $context): array
    {
        return [
            'subject_id' => $context['subject_id'] ?? null,
            'scope' => $context['scope'] ?? null,
            'expires_at' => $context['expires_at'] ?? null,
        ];
    }
}
