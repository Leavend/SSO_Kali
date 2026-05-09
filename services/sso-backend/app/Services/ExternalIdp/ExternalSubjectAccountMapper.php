<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

final class ExternalSubjectAccountMapper
{
    /**
     * @param  array{provider_key: string, subject: string, email: ?string, name: ?string, return_to: ?string, claims: array<string, mixed>}  $exchange
     * @return array{user: User, link: ExternalSubjectLink, created_user: bool, created_link: bool}
     */
    public function map(ExternalIdentityProvider $provider, array $exchange): array
    {
        if (($exchange['provider_key'] ?? null) !== $provider->provider_key) {
            throw new RuntimeException('External IdP exchange provider mismatch.');
        }

        return DB::transaction(function () use ($provider, $exchange): array {
            $subject = $this->requiredString($exchange, 'subject', 'External IdP subject is required.');
            $email = $this->normalEmail($exchange['email'] ?? null);
            $existingLink = ExternalSubjectLink::query()
                ->where('provider_key', $provider->provider_key)
                ->where('external_subject', $subject)
                ->lockForUpdate()
                ->first();

            if ($existingLink instanceof ExternalSubjectLink) {
                $user = $existingLink->user()->lockForUpdate()->firstOrFail();
                $this->assertUserUsable($user);
                $this->refreshLink($existingLink, $provider, $exchange, $email);
                $this->touchUserLogin($user, $exchange);

                return ['user' => $user->refresh(), 'link' => $existingLink->refresh(), 'created_user' => false, 'created_link' => false];
            }

            $user = $this->resolveUser($email, $exchange);
            $createdUser = ! $user->exists;
            $user->save();
            $this->assertUserUsable($user);

            $link = ExternalSubjectLink::query()->create([
                'user_id' => $user->id,
                'external_identity_provider_id' => $provider->id,
                'provider_key' => $provider->provider_key,
                'issuer' => $provider->issuer,
                'external_subject' => $subject,
                'email' => $email,
                'email_verified_at' => $this->emailVerified($exchange) ? now() : null,
                'display_name' => $this->displayName($exchange),
                'last_claims_snapshot' => $this->claimSnapshot($exchange),
                'last_login_at' => now(),
            ]);
            $this->touchUserLogin($user, $exchange);

            return ['user' => $user->refresh(), 'link' => $link->refresh(), 'created_user' => $createdUser, 'created_link' => true];
        });
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function resolveUser(?string $email, array $exchange): User
    {
        if ($email === null) {
            return $this->newExternalUser($email, $exchange);
        }

        $user = User::query()->where('email', $email)->lockForUpdate()->first();

        if ($user instanceof User) {
            if (! $this->emailVerified($exchange)) {
                throw new RuntimeException('External IdP email must be verified before linking an existing account.');
            }

            return $user;
        }

        return $this->newExternalUser($email, $exchange);
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function newExternalUser(?string $email, array $exchange): User
    {
        $subject = $this->requiredString($exchange, 'subject', 'External IdP subject is required.');
        $displayName = $this->displayName($exchange) ?? $email ?? 'External User';

        return new User([
            'subject_id' => 'ext_'.Str::lower(Str::random(24)),
            'subject_uuid' => (string) Str::uuid(),
            'email' => $email ?? 'external-'.$subject.'@external-idp.local',
            'display_name' => $displayName,
            'role' => 'user',
            'status' => 'active',
            'local_account_enabled' => false,
            'email_verified_at' => $this->emailVerified($exchange) ? now() : null,
            'last_login_at' => now(),
            'profile_synced_at' => now(),
        ]);
    }

    private function assertUserUsable(User $user): void
    {
        if ($user->status !== 'active' || $user->disabled_at !== null || ! $user->local_account_enabled && $user->status !== 'active') {
            throw new RuntimeException('Mapped local account is disabled.');
        }
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function touchUserLogin(User $user, array $exchange): void
    {
        $user->forceFill([
            'display_name' => $user->display_name ?: ($this->displayName($exchange) ?? $user->email),
            'last_login_at' => now(),
            'profile_synced_at' => now(),
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function refreshLink(ExternalSubjectLink $link, ExternalIdentityProvider $provider, array $exchange, ?string $email): void
    {
        $link->forceFill([
            'external_identity_provider_id' => $provider->id,
            'issuer' => $provider->issuer,
            'email' => $email,
            'email_verified_at' => $this->emailVerified($exchange) ? now() : $link->email_verified_at,
            'display_name' => $this->displayName($exchange),
            'last_claims_snapshot' => $this->claimSnapshot($exchange),
            'last_login_at' => now(),
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function displayName(array $exchange): ?string
    {
        $name = $exchange['name'] ?? null;

        return is_string($name) && $name !== '' ? $name : null;
    }

    /**
     * @param  array<string, mixed>  $exchange
     */
    private function emailVerified(array $exchange): bool
    {
        $claims = $exchange['claims'] ?? [];

        return is_array($claims) && ($claims['email_verified'] ?? false) === true;
    }

    private function normalEmail(mixed $email): ?string
    {
        return is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL)
            ? Str::lower($email)
            : null;
    }

    /**
     * @param  array<string, mixed>  $exchange
     * @return array<string, mixed>
     */
    private function claimSnapshot(array $exchange): array
    {
        $claims = is_array($exchange['claims'] ?? null) ? $exchange['claims'] : [];

        return array_intersect_key($claims, array_flip([
            'iss',
            'sub',
            'aud',
            'email',
            'email_verified',
            'name',
            'preferred_username',
        ]));
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function requiredString(array $values, string $key, string $message): string
    {
        $value = $values[$key] ?? null;

        if (! is_string($value) || $value === '') {
            throw new RuntimeException($message);
        }

        return $value;
    }
}
