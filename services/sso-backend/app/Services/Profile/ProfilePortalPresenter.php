<?php

declare(strict_types=1);

namespace App\Services\Profile;

use App\Models\User;
use App\Support\Oidc\OidcScope;
use App\Support\Oidc\ScopeSet;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

final class ProfilePortalPresenter
{
    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    public function present(User $user, array $claims): array
    {
        $scopes = ScopeSet::fromString(is_string($claims['scope'] ?? null) ? $claims['scope'] : '');

        return [
            'profile' => $this->profile($user, $scopes),
            'authorization' => $this->authorization($claims, $scopes),
            'security' => $this->security($user, $claims),
        ];
    }

    /**
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private function profile(User $user, array $scopes): array
    {
        return array_filter([
            'subject_id' => $user->subject_id,
            'display_name' => $this->whenScoped($scopes, OidcScope::PROFILE, $user->display_name),
            'given_name' => $this->whenScoped($scopes, OidcScope::PROFILE, $user->given_name),
            'family_name' => $this->whenScoped($scopes, OidcScope::PROFILE, $user->family_name),
            'email' => $this->whenScoped($scopes, OidcScope::EMAIL, $user->email),
            'email_verified' => ScopeSet::contains($scopes, OidcScope::EMAIL) ? $user->email_verified_at !== null : null,
            'phone' => $this->whenScoped($scopes, OidcScope::PROFILE, $user->phone),
            'phone_verified' => ScopeSet::contains($scopes, OidcScope::PROFILE) ? $user->phone_verified_at !== null : null,
            'status' => $user->status,
            'profile_synced_at' => $this->timestamp($user->profile_synced_at),
            'last_login_at' => $this->timestamp($user->last_login_at),
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private function authorization(array $claims, array $scopes): array
    {
        return array_filter([
            'scope' => is_string($claims['scope'] ?? null) ? $claims['scope'] : '',
            'roles' => $this->stringClaim($claims, $scopes, OidcScope::ROLES, 'roles'),
            'permissions' => $this->stringClaim($claims, $scopes, OidcScope::PERMISSIONS, 'permissions'),
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function security(User $user, array $claims): array
    {
        $context = $this->loginContext($user->subject_id);

        return [
            'session_id' => is_string($claims['sid'] ?? null) ? $claims['sid'] : null,
            'risk_score' => $context['risk_score'] ?? 0,
            'mfa_required' => (bool) ($context['mfa_required'] ?? false),
            'last_seen_at' => $context['last_seen_at'] ?? null,
        ];
    }

    /**
     * @param  list<string>  $scopes
     */
    private function whenScoped(array $scopes, string $scope, mixed $value): mixed
    {
        return ScopeSet::contains($scopes, $scope) ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  list<string>  $scopes
     * @return list<string>|null
     */
    private function stringClaim(array $claims, array $scopes, string $scope, string $name): ?array
    {
        if (! ScopeSet::contains($scopes, $scope) || ! is_array($claims[$name] ?? null)) {
            return null;
        }

        return array_values(array_filter($claims[$name], 'is_string'));
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loginContext(string $subjectId): ?array
    {
        $context = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();

        if ($context === null) {
            return null;
        }

        return [
            'risk_score' => $context->risk_score,
            'mfa_required' => (bool) $context->mfa_required,
            'last_seen_at' => $context->last_seen_at,
        ];
    }

    private function timestamp(mixed $value): ?string
    {
        return $value instanceof CarbonInterface ? $value->toIso8601String() : null;
    }
}
