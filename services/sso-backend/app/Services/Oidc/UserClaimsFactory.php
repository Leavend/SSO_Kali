<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\User;
use App\Support\Oidc\ScopeSet;
use Carbon\CarbonImmutable;

final class UserClaimsFactory
{
    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function accessTokenClaims(User $user, array $context, string $jti): array
    {
        $scope = (string) ($context['scope'] ?? 'openid');
        $timestamps = $this->timestamps((int) config('sso.ttl.access_token_minutes', 15));

        return [
            'iss' => config('sso.issuer'),
            'aud' => config('sso.resource_audience'),
            'sub' => $user->subject_id,
            'client_id' => $context['client_id'],
            'token_use' => 'access',
            'scope' => $scope,
            'jti' => $jti,
            'sid' => $context['session_id'],
            ...$this->sharedClaims($user, ScopeSet::fromString($scope)),
            ...$this->assuranceClaims($context, $timestamps['iat']),
            ...$timestamps,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function idTokenClaims(User $user, array $context, string $jti): array
    {
        $scope = (string) ($context['scope'] ?? 'openid');
        $timestamps = $this->timestamps((int) config('sso.ttl.id_token_minutes', 15));

        return array_filter([
            'iss' => config('sso.issuer'),
            'aud' => $context['client_id'],
            'sub' => $user->subject_id,
            'azp' => $context['client_id'],
            'token_use' => 'id',
            'jti' => $jti,
            'sid' => $context['session_id'],
            'nonce' => $context['nonce'] ?? null,
            ...$this->sharedClaims($user, ScopeSet::fromString($scope)),
            ...$this->assuranceClaims($context, $timestamps['iat']),
            ...$timestamps,
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private function sharedClaims(User $user, array $scopes): array
    {
        return [
            ...$this->profileClaims($user, $scopes),
            ...$this->emailClaims($user, $scopes),
        ];
    }

    /**
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private function profileClaims(User $user, array $scopes): array
    {
        if (! ScopeSet::contains($scopes, 'profile')) {
            return [];
        }

        return [
            'name' => $user->display_name,
            'given_name' => $user->given_name,
            'family_name' => $user->family_name,
        ];
    }

    /**
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private function emailClaims(User $user, array $scopes): array
    {
        if (! ScopeSet::contains($scopes, 'email')) {
            return [];
        }

        return [
            'email' => $user->email,
            'email_verified' => $user->email_verified_at !== null,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function timestamps(int $minutes): array
    {
        $now = CarbonImmutable::now();

        return [
            'iat' => $now->timestamp,
            'nbf' => $now->timestamp,
            'exp' => $now->addMinutes($minutes)->timestamp,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function assuranceClaims(array $context, int $issuedAt): array
    {
        return array_filter([
            'auth_time' => is_int($context['auth_time'] ?? null) ? $context['auth_time'] : $issuedAt,
            'amr' => $this->amr($context),
            'acr' => is_string($context['acr'] ?? null) ? $context['acr'] : null,
        ], static fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return list<string>
     */
    private function amr(array $context): array
    {
        return array_values(array_filter(
            is_array($context['amr'] ?? null) ? $context['amr'] : [],
            static fn (mixed $value): bool => is_string($value) && $value !== '',
        ));
    }
}
