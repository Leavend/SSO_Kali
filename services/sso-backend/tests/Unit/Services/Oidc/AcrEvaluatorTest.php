<?php

declare(strict_types=1);

use App\Services\Oidc\AcrEvaluator;

it('ranks urn:sso:loa:password below urn:sso:loa:mfa', function (): void {
    $evaluator = new AcrEvaluator;

    expect($evaluator->level('urn:sso:loa:password'))->toBeLessThan(
        $evaluator->level('urn:sso:loa:mfa')
    );
});

it('returns true when current acr satisfies requested', function (): void {
    $evaluator = new AcrEvaluator;

    expect($evaluator->satisfies('urn:sso:loa:mfa', 'urn:sso:loa:mfa'))->toBeTrue();
    expect($evaluator->satisfies('urn:sso:loa:mfa', 'urn:sso:loa:password'))->toBeTrue();
});

it('returns false when current acr is insufficient', function (): void {
    $evaluator = new AcrEvaluator;

    expect($evaluator->satisfies('urn:sso:loa:password', 'urn:sso:loa:mfa'))->toBeFalse();
});

it('handles null current acr as lowest level', function (): void {
    $evaluator = new AcrEvaluator;

    expect($evaluator->satisfies(null, 'urn:sso:loa:password'))->toBeFalse();
    expect($evaluator->satisfies(null, 'urn:sso:loa:mfa'))->toBeFalse();
});

it('returns true when requested acr is unknown (permissive fallback)', function (): void {
    $evaluator = new AcrEvaluator;

    // Unknown ACR values should not block — permissive by default
    expect($evaluator->satisfies('urn:sso:loa:mfa', 'urn:unknown:level'))->toBeTrue();
});
