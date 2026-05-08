<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\LogoutTokenService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

it('records structured success audit without leaking logout tokens', function (): void {
    Http::fake(['https://client.example/backchannel/logout' => Http::response([], 204)]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-a',
        'subject-a',
        'session-a',
        'https://client.example/backchannel/logout',
    );

    $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class));

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            $encoded = json_encode($payload, JSON_THROW_ON_ERROR);

            return ($payload['event'] ?? null) === 'backchannel_logout_succeeded'
                && ($payload['logout_channel'] ?? null) === 'backchannel'
                && ($payload['result'] ?? null) === 'succeeded'
                && data_get($payload, 'context.client_id') === 'client-a'
                && data_get($payload, 'context.subject_id') === 'subject-a'
                && data_get($payload, 'context.session_id') === 'session-a'
                && data_get($payload, 'context.http_status') === 204
                && ! str_contains($encoded, 'logout_token');
        }));
});

it('records structured failure audit for non success client responses', function (): void {
    Http::fake(['https://client.example/backchannel/logout' => Http::response([], 503)]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-a',
        'subject-a',
        'session-a',
        'https://client.example/backchannel/logout',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout failed');

    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && ($payload['logout_channel'] ?? null) === 'backchannel'
                && ($payload['result'] ?? null) === 'failed'
                && data_get($payload, 'context.failure_class') === 'non_success_response'
                && data_get($payload, 'context.http_status') === 503;
        }));
});

it('rejects insecure production logout uri before sending requests', function (): void {
    app()->detectEnvironment(fn (): string => 'production');
    config()->set('sso.logout.backchannel_require_https', true);
    Http::fake();
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-a',
        'subject-a',
        'session-a',
        'http://client.example/backchannel/logout',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout URI must use HTTPS in production.');

    Http::assertNothingSent();
    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && data_get($payload, 'context.failure_class') === 'uri_policy_violation';
        }));
});
