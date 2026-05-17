<?php

declare(strict_types=1);

namespace App\Services\Oidc;

final class UpstreamAuthorizationParameters
{
    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    public function make(string $state, array $context): array
    {
        return array_filter([
            'client_id' => (string) config('sso.upstream_oidc.client_id'),
            'redirect_uri' => (string) config('sso.upstream_oidc.redirect_uri'),
            'response_type' => 'code',
            'scope' => $this->scope($context),
            'state' => $state,
            'nonce' => (string) $context['session_id'],
            'prompt' => $this->optionalString($context['prompt'] ?? null),
            'max_age' => $this->optionalString($context['max_age'] ?? null),
            'login_hint' => $this->optionalString($context['login_hint'] ?? null),
            'code_challenge' => (string) $context['upstream_code_challenge'],
            'code_challenge_method' => 'S256',
        ], static fn (?string $value): bool => $value !== null);
    }

    /** @param array<string, mixed> $context */
    private function scope(array $context): string
    {
        $scope = (string) config('sso.upstream_oidc.scope');
        if (($context['access_type'] ?? 'offline') === 'offline' && ! str_contains($scope, 'offline_access')) {
            return trim($scope.' offline_access');
        }

        return $scope;
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
