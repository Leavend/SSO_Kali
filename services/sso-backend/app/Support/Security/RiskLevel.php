<?php

declare(strict_types=1);

namespace App\Support\Security;

/**
 * FR-019 / UC-72: Risk level enum for login risk evaluation.
 */
enum RiskLevel: string
{
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';

    public function exceedsThreshold(): bool
    {
        return $this === self::High;
    }
}
