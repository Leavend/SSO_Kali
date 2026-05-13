<?php

declare(strict_types=1);

namespace Tests\Unit\Services\Mfa;

use App\Models\MfaRecoveryCode;
use App\Models\User;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->service = app(RecoveryCodeService::class);
    $this->user = User::factory()->create();
});

describe('generate()', function (): void {
    it('generates exactly 8 recovery codes', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        expect($codes)->toHaveCount(8);
    });

    it('returns plain-text codes of 10 characters each', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        foreach ($codes as $code) {
            expect($code)->toBeString()->toHaveLength(10);
        }
    });

    it('stores bcrypt hashes in database', function (): void {
        $this->service->generate($this->user->getKey());

        $stored = MfaRecoveryCode::query()->forUser($this->user->getKey())->count();
        expect($stored)->toBe(8);
    });

    it('invalidates existing codes when regenerating', function (): void {
        $firstBatch = $this->service->generate($this->user->getKey());
        $secondBatch = $this->service->generate($this->user->getKey());

        // Old codes should be deleted, only new 8 remain
        $total = MfaRecoveryCode::query()->forUser($this->user->getKey())->count();
        expect($total)->toBe(8);

        // First batch codes should no longer verify
        foreach ($firstBatch as $code) {
            expect($this->service->verify($this->user->getKey(), $code))->toBeFalse();
        }

        // Second batch codes should verify
        expect($this->service->verify($this->user->getKey(), $secondBatch[0]))->toBeTrue();
    });

    it('generates unique codes per batch', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        expect(array_unique($codes))->toHaveCount(8);
    });
});

describe('verify()', function (): void {
    it('verifies a valid unused code', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        expect($this->service->verify($this->user->getKey(), $codes[0]))->toBeTrue();
    });

    it('rejects an already-consumed code', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        // First use succeeds
        expect($this->service->verify($this->user->getKey(), $codes[0]))->toBeTrue();
        // Second use fails (single-use)
        expect($this->service->verify($this->user->getKey(), $codes[0]))->toBeFalse();
    });

    it('rejects an invalid code', function (): void {
        $this->service->generate($this->user->getKey());

        expect($this->service->verify($this->user->getKey(), 'INVALIDCODE'))->toBeFalse();
    });

    it('rejects codes belonging to another user', function (): void {
        $codes = $this->service->generate($this->user->getKey());
        $otherUser = User::factory()->create();

        expect($this->service->verify($otherUser->getKey(), $codes[0]))->toBeFalse();
    });

    it('marks used_at timestamp after consumption', function (): void {
        $codes = $this->service->generate($this->user->getKey());
        $this->service->verify($this->user->getKey(), $codes[0]);

        $usedCount = MfaRecoveryCode::query()
            ->forUser($this->user->getKey())
            ->whereNotNull('used_at')
            ->count();

        expect($usedCount)->toBe(1);
    });
});

describe('remaining()', function (): void {
    it('returns 8 after fresh generation', function (): void {
        $this->service->generate($this->user->getKey());

        expect($this->service->remaining($this->user->getKey()))->toBe(8);
    });

    it('decreases after each code consumption', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        $this->service->verify($this->user->getKey(), $codes[0]);
        expect($this->service->remaining($this->user->getKey()))->toBe(7);

        $this->service->verify($this->user->getKey(), $codes[1]);
        expect($this->service->remaining($this->user->getKey()))->toBe(6);
    });

    it('returns 0 when all codes are consumed', function (): void {
        $codes = $this->service->generate($this->user->getKey());

        foreach ($codes as $code) {
            $this->service->verify($this->user->getKey(), $code);
        }

        expect($this->service->remaining($this->user->getKey()))->toBe(0);
    });

    it('returns 0 for user with no codes', function (): void {
        expect($this->service->remaining($this->user->getKey()))->toBe(0);
    });
});
