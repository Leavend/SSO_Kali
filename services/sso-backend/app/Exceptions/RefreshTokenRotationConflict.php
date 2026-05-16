<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Services\Oidc\RefreshTokenStore;
use RuntimeException;

/**
 * BE-FR032-001 — Concurrent refresh rotation race detected.
 *
 * Thrown by {@see RefreshTokenStore::rotateAtomic()}
 * when the atomic claim lost the race (another concurrent rotation
 * already revoked the row). The caller MUST translate this into an
 * `invalid_grant` token endpoint response so the duplicate request
 * is rejected without leaking technical detail.
 */
final class RefreshTokenRotationConflict extends RuntimeException
{
    public function __construct(public readonly string $tokenId)
    {
        parent::__construct('Refresh token rotation lost the atomic claim race.');
    }
}
