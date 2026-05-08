<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\LogoutTokenService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

it('posts a broker-issued logout token to the downstream client', function (): void {
    Http::fake([
        'https://app-a.example/api/backchannel/logout*' => Http::response([], 200),
    ]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'prototype-app-a',
        'subject-1',
        'session-1',
        'https://app-a.example/api/backchannel/logout?secret=hidden',
    );

    $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class));

    Http::assertSent(function ($request): bool {
        return $request->url() === 'https://app-a.example/api/backchannel/logout?secret=hidden'
            && is_string($request['logout_token'])
            && $request['logout_token'] !== '';
    });

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_succeeded'
                && data_get($payload, 'context.client_id') === 'prototype-app-a'
                && data_get($payload, 'context.subject_id') === 'subject-1'
                && data_get($payload, 'context.endpoint.host') === 'app-a.example'
                && data_get($payload, 'context.endpoint.path') === '/api/backchannel/logout'
                && ! str_contains(json_encode($payload, JSON_THROW_ON_ERROR), 'hidden');
        }));
});

it('retries failed back-channel delivery with bounded exponential backoff', function (): void {
    Http::fake([
        'https://app-a.example/api/backchannel/logout*' => Http::response([], 500),
    ]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'prototype-app-a',
        'subject-1',
        'session-1',
        'https://app-a.example/api/backchannel/logout?access_token=hidden',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout failed');

    expect($job->tries)->toBe(3)
        ->and($job->backoff())->toBe([10, 30, 90]);

    Log::shouldHaveReceived('warning')
        ->with('[BACKCHANNEL_LOGOUT_FAILED]', Mockery::on(function (array $context): bool {
            return ($context['client_id'] ?? null) === 'prototype-app-a'
                && ($context['subject_id'] ?? null) === 'subject-1'
                && ($context['session_id'] ?? null) === 'session-1'
                && ($context['http_status'] ?? null) === 500
                && data_get($context, 'endpoint.host') === 'app-a.example'
                && data_get($context, 'endpoint.path') === '/api/backchannel/logout'
                && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), 'hidden');
        }));

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && data_get($payload, 'context.client_id') === 'prototype-app-a'
                && data_get($payload, 'context.http_status') === 500
                && ! str_contains(json_encode($payload, JSON_THROW_ON_ERROR), 'hidden');
        }));
});
