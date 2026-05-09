<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use App\Models\ExternalIdpClaimMapping;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use RuntimeException;

final class ExternalIdpClaimsMapper
{
    private const SENSITIVE_KEYS = [
        'access_token',
        'refresh_token',
        'id_token',
        'client_secret',
        'code_verifier',
    ];

    /**
     * @param  array<string, mixed>  $claims
     * @return array{provider_key: string, subject: string, email: ?string, name: ?string, username: ?string, email_verified: bool, claims: array<string, mixed>}
     */
    public function map(ExternalIdentityProvider $provider, array $claims): array
    {
        $mapping = $this->mapping($provider);
        $this->assertRequired($claims, $mapping);
        $subject = $this->firstString($claims, $mapping['subject_paths']);

        if ($subject === null) {
            throw new RuntimeException('External IdP subject claim is required.');
        }

        return [
            'provider_key' => $provider->provider_key,
            'subject' => $subject,
            'email' => $this->email($claims, $mapping),
            'name' => $this->firstString($claims, $mapping['name_paths']),
            'username' => $this->firstString($claims, $mapping['username_paths']),
            'email_verified' => $this->emailVerified($claims),
            'claims' => $this->safeSnapshot($claims),
        ];
    }

    /**
     * @return array{subject_paths: list<string>, email_paths: list<string>, name_paths: list<string>, username_paths: list<string>, required_paths: list<string>, require_verified_email: bool}
     */
    private function mapping(ExternalIdentityProvider $provider): array
    {
        $custom = $provider->claimMapping()->where('enabled', true)->first();

        if ($custom instanceof ExternalIdpClaimMapping) {
            return $this->customMapping($custom);
        }

        return $this->defaultMapping();
    }

    /**
     * @return array{subject_paths: list<string>, email_paths: list<string>, name_paths: list<string>, username_paths: list<string>, required_paths: list<string>, require_verified_email: bool}
     */
    private function customMapping(ExternalIdpClaimMapping $mapping): array
    {
        return [
            'subject_paths' => $this->paths($mapping->subject_paths),
            'email_paths' => $this->paths($mapping->email_paths),
            'name_paths' => $this->paths($mapping->name_paths),
            'username_paths' => $this->paths($mapping->username_paths),
            'required_paths' => $this->paths($mapping->required_paths),
            'require_verified_email' => $mapping->require_verified_email,
        ];
    }

    /**
     * @return array{subject_paths: list<string>, email_paths: list<string>, name_paths: list<string>, username_paths: list<string>, required_paths: list<string>, require_verified_email: bool}
     */
    private function defaultMapping(): array
    {
        return [
            'subject_paths' => ['sub'],
            'email_paths' => ['email'],
            'name_paths' => ['name', 'preferred_username'],
            'username_paths' => ['preferred_username', 'email'],
            'required_paths' => ['sub'],
            'require_verified_email' => true,
        ];
    }

    /**
     * @param  list<string>  $paths
     */
    private function firstString(array $claims, array $paths): ?string
    {
        foreach ($paths as $path) {
            $value = Arr::get($claims, $path);

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $mapping
     */
    private function email(array $claims, array $mapping): ?string
    {
        $email = $this->firstString($claims, $mapping['email_paths']);

        if ($email === null || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        if ($mapping['require_verified_email'] && ! $this->emailVerified($claims)) {
            return null;
        }

        return Str::lower($email);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function emailVerified(array $claims): bool
    {
        return Arr::get($claims, 'email_verified') === true;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function safeSnapshot(array $claims): array
    {
        return collect($claims)
            ->reject(fn (mixed $value, string $key): bool => in_array($key, self::SENSITIVE_KEYS, true))
            ->only(['iss', 'sub', 'aud', 'email', 'email_verified', 'name', 'preferred_username', 'groups', 'roles'])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $mapping
     */
    private function assertRequired(array $claims, array $mapping): void
    {
        foreach ($mapping['required_paths'] as $path) {
            if (Arr::get($claims, $path) === null) {
                throw new RuntimeException("External IdP required claim [{$path}] is missing.");
            }
        }
    }

    /**
     * @param  array<int, mixed>|null  $paths
     * @return list<string>
     */
    private function paths(?array $paths): array
    {
        return array_values(array_filter($paths ?? [], fn (mixed $path): bool => is_string($path) && $path !== ''));
    }
}
