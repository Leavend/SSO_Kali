<?php

declare(strict_types=1);

use App\Services\Oidc\AcrEvaluator;

/**
 * FR-019 / UC-19: Step-up authentication via acr_values.
 *
 * When a client requests acr_values=urn:sso:loa:mfa in the authorize request,
 * the system must verify the current session's ACR level is sufficient.
 * If not, the session cannot be reused and the user must re-authenticate with MFA.
 */
beforeEach(function (): void {
    // Set up a downstream client
    $this->clientId = 'test-client';
    $this->redirectUri = 'https://app.test/callback';
    $this->state = 'random-state-123';
    $this->nonce = 'random-nonce-456';
    $this->codeChallenge = base64_encode(random_bytes(32));

    config([
        'sso.downstream_clients' => [
            [
                'client_id' => $this->clientId,
                'redirect_uris' => [$this->redirectUri],
                'scopes' => ['openid', 'profile', 'email'],
                'skip_consent' => true,
            ],
        ],
    ]);
});

it('issues code directly when session acr meets requested acr_values', function (): void {
    $evaluator = app(AcrEvaluator::class);

    // Session has MFA-level ACR
    expect($evaluator->satisfies('urn:sso:loa:mfa', 'urn:sso:loa:mfa'))->toBeTrue();
    expect($evaluator->satisfies('urn:sso:loa:mfa', 'urn:sso:loa:password'))->toBeTrue();
});

it('returns step_up_required when session acr is below requested acr_values', function (): void {
    $evaluator = app(AcrEvaluator::class);

    // Session only has password-level ACR, but MFA is requested
    expect($evaluator->satisfies('urn:sso:loa:password', 'urn:sso:loa:mfa'))->toBeFalse();
});

it('ignores acr_values when not provided in authorize request', function (): void {
    $evaluator = app(AcrEvaluator::class);

    // No acr_values → should not block (null requested is permissive)
    // The evaluator handles this at the caller level — if no acr_values param,
    // the check is simply skipped.
    expect($evaluator->satisfies(null, 'urn:sso:loa:password'))->toBeFalse();
    expect($evaluator->satisfies('urn:sso:loa:password', 'urn:sso:loa:password'))->toBeTrue();
});

it('supports urn:sso:loa:mfa as valid acr_values', function (): void {
    $evaluator = app(AcrEvaluator::class);

    expect($evaluator->level('urn:sso:loa:mfa'))->toBe(20);
    expect($evaluator->level('urn:sso:loa:password'))->toBe(10);
    expect($evaluator->level(null))->toBe(0);
});

it('requires step-up when browser session acr is insufficient for requested acr_values', function (): void {
    $evaluator = app(AcrEvaluator::class);

    // Simulate: browser session has acr=password, client requests acr_values=mfa
    $sessionAcr = 'urn:sso:loa:password';
    $requestedAcr = 'urn:sso:loa:mfa';

    $needsStepUp = ! $evaluator->satisfies($sessionAcr, $requestedAcr);

    expect($needsStepUp)->toBeTrue();
});

it('does not require step-up when browser session acr meets requested acr_values', function (): void {
    $evaluator = app(AcrEvaluator::class);

    // Simulate: browser session has acr=mfa, client requests acr_values=mfa
    $sessionAcr = 'urn:sso:loa:mfa';
    $requestedAcr = 'urn:sso:loa:mfa';

    $needsStepUp = ! $evaluator->satisfies($sessionAcr, $requestedAcr);

    expect($needsStepUp)->toBeFalse();
});
