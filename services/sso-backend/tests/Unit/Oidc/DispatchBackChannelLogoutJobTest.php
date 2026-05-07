<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\LogoutTokenService;
use Illuminate\Support\Facades\Http;

it('posts a broker-issued logout token to the downstream client', function (): void {
    Http::fake([
        'https://app-a.example/api/backchannel/logout' => Http::response([], 200),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'prototype-app-a',
        'subject-1',
        'session-1',
        'https://app-a.example/api/backchannel/logout',
    );

    $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class));

    Http::assertSent(function ($request): bool {
        return $request->url() === 'https://app-a.example/api/backchannel/logout'
            && is_string($request['logout_token'])
            && $request['logout_token'] !== '';
    });
});

it('retries failed back-channel delivery with bounded exponential backoff', function (): void {
    Http::fake([
        'https://app-a.example/api/backchannel/logout' => Http::response([], 500),
    ]);

    $job = new DispatchBackChannelLogoutJob(
        'prototype-app-a',
        'subject-1',
        'session-1',
        'https://app-a.example/api/backchannel/logout',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout failed');

    expect($job->tries)->toBe(3)
        ->and($job->backoff())->toBe([10, 30, 90]);
});
