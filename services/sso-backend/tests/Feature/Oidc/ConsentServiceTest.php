<?php

declare(strict_types=1);

use App\Models\UserConsent;
use App\Services\Oidc\ConsentService;
use Illuminate\Support\Carbon;

/**
 * FR-011 / ISSUE-01: ConsentService unit tests.
 *
 * Covers: grant, hasConsent, revoke, listForSubject, scope coverage.
 */
beforeEach(function (): void {
    $this->service = app(ConsentService::class);
});

describe('grant', function (): void {
    it('creates a new consent record', function (): void {
        $consent = $this->service->grant('user-1', 'app-a', ['openid', 'profile', 'email']);

        expect($consent)->toBeInstanceOf(UserConsent::class)
            ->and($consent->subject_id)->toBe('user-1')
            ->and($consent->client_id)->toBe('app-a')
            ->and($consent->scopes)->toBe(['openid', 'profile', 'email'])
            ->and($consent->granted_at)->toBeInstanceOf(Carbon::class)
            ->and($consent->revoked_at)->toBeNull();
    });

    it('upserts existing consent with new scopes', function (): void {
        $this->service->grant('user-1', 'app-a', ['openid', 'profile']);
        $updated = $this->service->grant('user-1', 'app-a', ['openid', 'profile', 'email']);

        expect($updated->scopes)->toBe(['openid', 'profile', 'email']);
        expect(UserConsent::query()->where('subject_id', 'user-1')->where('client_id', 'app-a')->count())->toBe(1);
    });

    it('re-activates a revoked consent on re-grant', function (): void {
        $this->service->grant('user-1', 'app-b', ['openid']);
        $this->service->revoke('user-1', 'app-b');

        $reGranted = $this->service->grant('user-1', 'app-b', ['openid', 'profile']);

        expect($reGranted->revoked_at)->toBeNull()
            ->and($reGranted->scopes)->toBe(['openid', 'profile']);
    });
});

describe('hasConsent', function (): void {
    it('returns true when consent covers all requested scopes', function (): void {
        $this->service->grant('user-2', 'app-a', ['openid', 'profile', 'email']);

        expect($this->service->hasConsent('user-2', 'app-a', ['openid', 'profile']))->toBeTrue();
    });

    it('returns false when consent does not cover all scopes', function (): void {
        $this->service->grant('user-2', 'app-a', ['openid', 'profile']);

        expect($this->service->hasConsent('user-2', 'app-a', ['openid', 'profile', 'email']))->toBeFalse();
    });

    it('returns false when no consent exists', function (): void {
        expect($this->service->hasConsent('user-3', 'app-x', ['openid']))->toBeFalse();
    });

    it('returns false for revoked consent', function (): void {
        $this->service->grant('user-4', 'app-a', ['openid', 'profile']);
        $this->service->revoke('user-4', 'app-a');

        expect($this->service->hasConsent('user-4', 'app-a', ['openid', 'profile']))->toBeFalse();
    });
});

describe('revoke', function (): void {
    it('soft-revokes an active consent', function (): void {
        $this->service->grant('user-5', 'app-a', ['openid']);

        $result = $this->service->revoke('user-5', 'app-a');

        expect($result)->toBeTrue();

        $consent = UserConsent::query()->where('subject_id', 'user-5')->where('client_id', 'app-a')->first();
        expect($consent->revoked_at)->not->toBeNull();
    });

    it('returns false when no active consent exists', function (): void {
        expect($this->service->revoke('user-6', 'app-z'))->toBeFalse();
    });
});

describe('listForSubject', function (): void {
    it('returns only active consents for the user', function (): void {
        $this->service->grant('user-7', 'app-a', ['openid']);
        $this->service->grant('user-7', 'app-b', ['openid', 'profile']);
        $this->service->grant('user-7', 'app-c', ['openid']);
        $this->service->revoke('user-7', 'app-c');

        $list = $this->service->listForSubject('user-7');

        expect($list)->toHaveCount(2)
            ->and($list->pluck('client_id')->all())->toContain('app-a', 'app-b');
    });

    it('returns empty collection when no consents exist', function (): void {
        expect($this->service->listForSubject('user-8'))->toHaveCount(0);
    });
});
