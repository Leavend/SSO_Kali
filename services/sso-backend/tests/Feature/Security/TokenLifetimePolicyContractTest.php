<?php

declare(strict_types=1);

use App\Actions\Security\ValidateTokenLifetimePolicyAction;
use App\Console\Commands\CheckTokenLifetimePolicyCommand;
use App\Models\AuthenticationAuditEvent;
use App\Support\Security\TokenLifetimePolicy;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

/**
 * BE-FR038-001 — Token Lifetime Policy Bounds + Versioning Contract.
 *
 * Locks:
 *
 *   1. The default config (`config/sso.php` → `sso.ttl.*`) is within
 *      the FR-038 envelope.
 *   2. Any TTL outside its min/max bound surfaces as a violation and
 *      fails the deploy guard with exit code 1.
 *   3. `refresh_token_family_days < refresh_token_days` is a hard
 *      violation (family expiry must outlive a single refresh).
 *   4. A fingerprint change triggers a single `token_lifetime_policy_changed`
 *      audit row so policy rotations are versioned.
 */
beforeEach(function (): void {
    Cache::flush();
});

it('accepts the default config as within FR-038 bounds', function (): void {
    $result = app(ValidateTokenLifetimePolicyAction::class)->execute();

    expect($result['valid'])->toBeTrue()
        ->and($result['violations'])->toBe([])
        ->and($result['policy']['access_token_minutes'])->toBeLessThanOrEqual(TokenLifetimePolicy::ACCESS_TOKEN_MAX_MINUTES)
        ->and($result['policy']['refresh_token_days'])->toBeLessThanOrEqual(TokenLifetimePolicy::REFRESH_TOKEN_MAX_DAYS);
});

it('flags an access token TTL above the maximum', function (): void {
    config()->set('sso.ttl.access_token_minutes', TokenLifetimePolicy::ACCESS_TOKEN_MAX_MINUTES + 1);

    $result = app(ValidateTokenLifetimePolicyAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and($result['violations'])->toHaveCount(1)
        ->and($result['violations'][0])->toContain('access_token_minutes');
});

it('flags a refresh family shorter than refresh token days', function (): void {
    config()->set('sso.ttl.refresh_token_days', 30);
    config()->set('sso.ttl.refresh_token_family_days', 7);

    $result = app(ValidateTokenLifetimePolicyAction::class)->execute();

    expect($result['valid'])->toBeFalse()
        ->and($result['violations'])->toContain('sso.ttl.refresh_token_family_days (7) MUST be >= refresh_token_days (30).');
});

it('exits non-zero from the deploy guard when bounds are violated', function (): void {
    config()->set('sso.ttl.refresh_token_days', TokenLifetimePolicy::REFRESH_TOKEN_MAX_DAYS + 30);

    $exit = Artisan::call('sso:check-token-lifetime-policy');

    expect($exit)->toBe(CheckTokenLifetimePolicyCommand::FAILURE);
    expect(Artisan::output())->toContain('refresh_token_days');
});

it('exits zero from the deploy guard when bounds are satisfied', function (): void {
    $exit = Artisan::call('sso:check-token-lifetime-policy');

    expect($exit)->toBe(CheckTokenLifetimePolicyCommand::SUCCESS);
    expect(Artisan::output())->toContain('within FR-038 bounds');
});

it('records exactly one token_lifetime_policy_changed audit row per fingerprint rotation', function (): void {
    config()->set('sso.ttl.access_token_minutes', 10);

    app(ValidateTokenLifetimePolicyAction::class)->execute();
    app(ValidateTokenLifetimePolicyAction::class)->execute();

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'token_lifetime_policy_changed')
        ->count())->toBe(1);

    config()->set('sso.ttl.access_token_minutes', 30);
    app(ValidateTokenLifetimePolicyAction::class)->execute();

    expect(AuthenticationAuditEvent::query()
        ->where('event_type', 'token_lifetime_policy_changed')
        ->count())->toBe(2);
});
