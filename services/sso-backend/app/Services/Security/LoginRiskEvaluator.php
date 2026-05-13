<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Support\Security\RiskLevel;

/**
 * FR-019 / UC-72: Login risk evaluator.
 *
 * Evaluates login risk based on IP geolocation change, device fingerprint
 * novelty, and login velocity. Returns a RiskLevel enum.
 *
 * Phase-3 foundational implementation — uses heuristic scoring.
 * Future: integrate with ML-based risk engine.
 */
final class LoginRiskEvaluator
{
    private const int VELOCITY_THRESHOLD = 10;

    /**
     * Evaluate login risk for a given authentication attempt.
     */
    public function evaluate(
        string $subjectId,
        string $ipAddress,
        ?string $deviceFingerprint = null,
        bool $isNewDevice = false,
        bool $isNewIp = false,
        int $recentLoginCount = 0,
    ): RiskLevel {
        $score = 0;

        if ($isNewIp) {
            $score += 30;
        }

        if ($isNewDevice) {
            $score += 20;
        }

        if ($recentLoginCount > self::VELOCITY_THRESHOLD) {
            $score += 50;
        }

        return match (true) {
            $score >= 50 => RiskLevel::High,
            $score >= 20 => RiskLevel::Medium,
            default => RiskLevel::Low,
        };
    }
}
