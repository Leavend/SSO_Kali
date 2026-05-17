<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Crypto\UpstreamTokenEncryptor;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;

final class RefreshTokenPayloadMapper
{
    public function __construct(private readonly UpstreamTokenEncryptor $encryptor) {}

    /** @return array<string, mixed> */
    public function map(object $record): array
    {
        return [
            'subject_id' => $record->subject_id,
            'client_id' => $record->client_id,
            'refresh_token_id' => $record->refresh_token_id,
            'token_family_id' => $record->token_family_id,
            'family_created_at' => $this->authTime($record->family_created_at ?? $record->created_at ?? null),
            'scope' => $record->scope,
            'session_id' => $record->session_id,
            'auth_time' => $this->authTime($record->auth_time),
            'amr' => $this->decodeAmr($record->amr),
            'acr' => is_string($record->acr) ? $record->acr : null,
            'upstream_refresh_token' => $this->decrypt($record->upstream_refresh_token),
            'expires_at' => $record->expires_at,
        ];
    }

    public function authTime(mixed $value): ?int
    {
        return $value === null ? null : CarbonImmutable::parse((string) $value)->timestamp;
    }

    /** @return list<string> */
    public function decodeAmr(mixed $amr): array
    {
        if (! is_string($amr) || $amr === '') {
            return [];
        }

        $decoded = json_decode($amr, true, 512, JSON_THROW_ON_ERROR);

        return array_values(array_filter(is_array($decoded) ? $decoded : [], 'is_string'));
    }

    public function decrypt(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if ($this->encryptor->isLegacyFormat($value)) {
            return Crypt::decryptString($value);
        }

        return $this->encryptor->decrypt($value);
    }
}
