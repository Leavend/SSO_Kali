<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Crypto\UpstreamTokenEncryptor;
use Carbon\CarbonImmutable;

final class RefreshTokenIssuePayloadFactory
{
    public function __construct(private readonly UpstreamTokenEncryptor $encryptor) {}

    /**
     * @param  list<string>  $amr
     * @return array<string, mixed>
     */
    public function make(
        string $subjectId,
        string $clientId,
        string $scope,
        string $sessionId,
        ?string $upstreamRefreshToken,
        int $authTime,
        array $amr,
        ?string $acr,
        string $tokenId,
        string $tokenFamilyId,
        string $secret,
        ?int $familyCreatedAt,
    ): array {
        return [
            'subject_id' => $subjectId,
            'subject_uuid' => $subjectId,
            'client_id' => $clientId,
            'refresh_token_id' => $tokenId,
            'token_family_id' => $tokenFamilyId,
            'family_created_at' => CarbonImmutable::createFromTimestamp($familyCreatedAt ?? now()->timestamp),
            'secret_hash' => hash('sha256', $secret),
            'scope' => $scope,
            'session_id' => $sessionId,
            'auth_time' => CarbonImmutable::createFromTimestamp($authTime),
            'amr' => $amr === [] ? null : json_encode($amr, JSON_THROW_ON_ERROR),
            'acr' => $acr,
            'upstream_refresh_token' => $this->encrypt($upstreamRefreshToken),
            'expires_at' => now()->addDays((int) config('sso.ttl.refresh_token_days', 30)),
            'replaced_by_token_id' => null,
            'revoked_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function encrypt(?string $value): ?string
    {
        return $value === null ? null : $this->encryptor->encrypt($value);
    }
}
