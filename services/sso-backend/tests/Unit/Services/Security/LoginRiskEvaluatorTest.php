<?php

declare(strict_types=1);

use App\Services\Security\LoginRiskEvaluator;
use App\Support\Security\RiskLevel;

it('returns low risk for known IP and device', function (): void {
    $evaluator = app(LoginRiskEvaluator::class);

    $risk = $evaluator->evaluate(
        subjectId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'known-device-fp',
    );

    expect($risk)->toBe(RiskLevel::Low);
});

it('returns medium risk for new device with known IP', function (): void {
    $evaluator = app(LoginRiskEvaluator::class);

    // Simulate: known IP but new device fingerprint
    $risk = $evaluator->evaluate(
        subjectId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: null, // no prior device record
        isNewDevice: true,
    );

    expect($risk)->toBe(RiskLevel::Medium);
});

it('returns high risk for new IP and new device', function (): void {
    $evaluator = app(LoginRiskEvaluator::class);

    $risk = $evaluator->evaluate(
        subjectId: 'user-123',
        ipAddress: '203.0.113.99',
        deviceFingerprint: null,
        isNewDevice: true,
        isNewIp: true,
    );

    expect($risk)->toBe(RiskLevel::High);
});

it('returns high risk when login velocity exceeds threshold', function (): void {
    $evaluator = app(LoginRiskEvaluator::class);

    $risk = $evaluator->evaluate(
        subjectId: 'user-123',
        ipAddress: '192.168.1.1',
        deviceFingerprint: 'known-device-fp',
        recentLoginCount: 20, // exceeds threshold
    );

    expect($risk)->toBe(RiskLevel::High);
});
