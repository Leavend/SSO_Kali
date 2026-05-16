<?php

declare(strict_types=1);

namespace App\Support\Security;

use App\Actions\Security\ValidateTokenLifetimePolicyAction;
use App\Console\Commands\CheckTokenLifetimePolicyCommand;

/**
 * BE-FR038-001 — Token lifetime policy bounds.
 *
 * Centralizes the safe operating envelope for OIDC token TTLs. The
 * config keys (`sso.ttl.*`) remain the runtime contract; this value
 * object expresses the bounds those config values MUST satisfy and is
 * consumed by:
 *
 *   - {@see ValidateTokenLifetimePolicyAction}
 *     for boot/deploy validation.
 *   - {@see CheckTokenLifetimePolicyCommand}
 *     for deploy gating (`sso:check-token-lifetime-policy`).
 *
 * Bounds rationale (kept conservative; tighten later when admin policy
 * console FR-055 ships):
 *
 *   - Access tokens: 1m..1h. Anything shorter is ops noise; anything
 *     longer is a credential blast-radius problem against revocation
 *     tracking (FR-034/FR-036).
 *   - ID tokens: 1m..1h. Match access token lifecycle so RP token
 *     handling stays simple.
 *   - Refresh tokens: 1d..90d. Below 1d defeats reauth UX; above 90d
 *     leaks beyond family expiry guard.
 *   - Refresh family: must be >= refresh_token_days and <= 365d.
 */
final readonly class TokenLifetimePolicy
{
    public const ACCESS_TOKEN_MIN_MINUTES = 1;

    public const ACCESS_TOKEN_MAX_MINUTES = 60;

    public const ID_TOKEN_MIN_MINUTES = 1;

    public const ID_TOKEN_MAX_MINUTES = 60;

    public const REFRESH_TOKEN_MIN_DAYS = 1;

    public const REFRESH_TOKEN_MAX_DAYS = 90;

    public const REFRESH_FAMILY_MIN_DAYS = 1;

    public const REFRESH_FAMILY_MAX_DAYS = 365;

    public function __construct(
        public int $accessTokenMinutes,
        public int $idTokenMinutes,
        public int $refreshTokenDays,
        public int $refreshTokenFamilyDays,
    ) {}

    /**
     * @param  array<string, mixed>  $config
     */
    public static function fromConfig(array $config): self
    {
        return new self(
            accessTokenMinutes: (int) ($config['access_token_minutes'] ?? 0),
            idTokenMinutes: (int) ($config['id_token_minutes'] ?? 0),
            refreshTokenDays: (int) ($config['refresh_token_days'] ?? 0),
            refreshTokenFamilyDays: (int) ($config['refresh_token_family_days'] ?? 0),
        );
    }

    /**
     * @return list<string>
     */
    public function violations(): array
    {
        return array_values(array_filter([
            $this->boundViolation('access_token_minutes', $this->accessTokenMinutes, self::ACCESS_TOKEN_MIN_MINUTES, self::ACCESS_TOKEN_MAX_MINUTES, 'minutes'),
            $this->boundViolation('id_token_minutes', $this->idTokenMinutes, self::ID_TOKEN_MIN_MINUTES, self::ID_TOKEN_MAX_MINUTES, 'minutes'),
            $this->boundViolation('refresh_token_days', $this->refreshTokenDays, self::REFRESH_TOKEN_MIN_DAYS, self::REFRESH_TOKEN_MAX_DAYS, 'days'),
            $this->boundViolation('refresh_token_family_days', $this->refreshTokenFamilyDays, self::REFRESH_FAMILY_MIN_DAYS, self::REFRESH_FAMILY_MAX_DAYS, 'days'),
            $this->refreshTokenFamilyDays < $this->refreshTokenDays
                ? sprintf(
                    'sso.ttl.refresh_token_family_days (%d) MUST be >= refresh_token_days (%d).',
                    $this->refreshTokenFamilyDays,
                    $this->refreshTokenDays,
                )
                : null,
        ]));
    }

    public function isValid(): bool
    {
        return $this->violations() === [];
    }

    /**
     * @return array<string, int>
     */
    public function snapshot(): array
    {
        return [
            'access_token_minutes' => $this->accessTokenMinutes,
            'id_token_minutes' => $this->idTokenMinutes,
            'refresh_token_days' => $this->refreshTokenDays,
            'refresh_token_family_days' => $this->refreshTokenFamilyDays,
        ];
    }

    /**
     * Stable fingerprint of the lifetime policy. Used for change-versioning
     * and audit row context so a rotation/widening of any TTL is observable
     * across boots without comparing four numbers manually.
     */
    public function fingerprint(): string
    {
        return hash('sha256', json_encode([
            'access' => $this->accessTokenMinutes,
            'id' => $this->idTokenMinutes,
            'refresh' => $this->refreshTokenDays,
            'family' => $this->refreshTokenFamilyDays,
        ], JSON_THROW_ON_ERROR));
    }

    private function boundViolation(string $key, int $value, int $min, int $max, string $unit): ?string
    {
        if ($value < $min) {
            return sprintf('sso.ttl.%s (%d %s) is below minimum %d %s.', $key, $value, $unit, $min, $unit);
        }

        if ($value > $max) {
            return sprintf('sso.ttl.%s (%d %s) exceeds maximum %d %s.', $key, $value, $unit, $max, $unit);
        }

        return null;
    }
}
