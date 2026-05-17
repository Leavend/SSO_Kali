<?php

declare(strict_types=1);

use App\Services\Oidc\RefreshTokenFamily;
use App\Services\Oidc\RefreshTokenReuseSignal;
use Carbon\CarbonImmutable;

it('serializes refresh token reuse signals to the token endpoint contract shape', function (): void {
    $record = ['subject_id' => 'subject-a'];

    expect((new RefreshTokenReuseSignal($record, true, 'family-a', 'token-a'))->toArray())
        ->toBe([
            'record' => $record,
            'reuse' => true,
            'family_id' => 'family-a',
            'token_id' => 'token-a',
        ]);
});

it('detects refresh token family expiry from record timestamps', function (): void {
    config()->set('sso.ttl.refresh_token_family_days', 90);

    $expired = (object) [
        'token_family_id' => 'family-expired',
        'family_created_at' => CarbonImmutable::now()->subDays(91)->toDateTimeString(),
    ];
    $active = (object) [
        'token_family_id' => 'family-active',
        'family_created_at' => CarbonImmutable::now()->subDays(1)->toDateTimeString(),
    ];

    expect(RefreshTokenFamily::fromRecord($expired)->isExpired())->toBeTrue()
        ->and(RefreshTokenFamily::fromRecord($active)->isExpired())->toBeFalse();
});
