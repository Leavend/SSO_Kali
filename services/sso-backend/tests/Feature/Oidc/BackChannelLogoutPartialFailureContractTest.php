<?php

declare(strict_types=1);

use App\Services\Oidc\BackChannelLogoutDispatcher;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Log;

it('keeps partial queue dispatch failures isolated per client', function (): void {
    Bus::fake();
    Log::spy();

    $dispatcher = app(BackChannelLogoutDispatcher::class);

    $results = $dispatcher->dispatch('subject-a', 'session-a', [
        [
            'client_id' => 'client-ok',
            'backchannel_logout_uri' => 'https://client-ok.example/backchannel/logout',
        ],
        [
            'client_id' => 'client-invalid',
        ],
        [
            'client_id' => 'client-after-failure',
            'backchannel_logout_uri' => 'https://client-after.example/backchannel/logout',
        ],
    ]);

    expect($results)->toHaveCount(3)
        ->and($results[0])->toMatchArray([
            'client_id' => 'client-ok',
            'status' => 'queued',
            'http_status' => 202,
        ])
        ->and($results[1])->toMatchArray([
            'client_id' => 'client-invalid',
            'status' => 'failed',
            'http_status' => 0,
            'failure_class' => 'queue_dispatch_failed',
        ])
        ->and($results[2])->toMatchArray([
            'client_id' => 'client-after-failure',
            'status' => 'queued',
            'http_status' => 202,
        ]);

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && ($payload['logout_channel'] ?? null) === 'backchannel'
                && ($payload['result'] ?? null) === 'failed'
                && data_get($payload, 'context.client_id') === 'client-invalid'
                && data_get($payload, 'context.failure_class') === 'queue_dispatch_failed';
        }));
});
