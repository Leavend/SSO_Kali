<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\LogoutTokenService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

it('proves downstream outage is retryable auditable and secret-safe', function (): void {
    Http::fake([
        'https://client-outage.example/backchannel/logout*' => Http::response([], 503),
    ]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-outage',
        'subject-operational-drill',
        'session-operational-drill',
        'https://client-outage.example/backchannel/logout?access_token=must-not-leak',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout failed for client [client-outage] with status [503].');

    expect($job->tries)->toBe(3)
        ->and($job->backoff())->toBe([10, 30, 90])
        ->and($job->tags())->toContain('backchannel-logout', 'client:client-outage', 'session:session-operational-drill');

    Http::assertSentCount(1);
    assertBackChannelFailureWarningWasSecretSafe();
    assertBackChannelFailureAuditWasSecretSafe();
});

it('proves production uri policy failure is blocked before network delivery', function (): void {
    app()->detectEnvironment(fn (): string => 'production');
    config()->set('sso.logout.backchannel_require_https', true);
    Http::fake();
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-insecure-uri',
        'subject-operational-drill',
        'session-operational-drill',
        'http://client.example/backchannel/logout?logout_token=must-not-leak',
    );

    expect(fn () => $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class)))
        ->toThrow(RuntimeException::class, 'Back-channel logout URI must use HTTPS in production.');

    Http::assertNothingSent();
    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && data_get($payload, 'context.client_id') === 'client-insecure-uri'
                && data_get($payload, 'context.failure_class') === 'uri_policy_violation'
                && data_get($payload, 'context.failure_reason') === 'https_required'
                && data_get($payload, 'context.endpoint.scheme') === 'http'
                && ! operational_drill_payload_contains_secret($payload);
        }));
});

it('proves successful delivery records a sanitized operational audit trail', function (): void {
    Http::fake([
        'https://client-ok.example/backchannel/logout*' => Http::response([], 204),
    ]);
    Log::spy();

    $job = new DispatchBackChannelLogoutJob(
        'client-ok',
        'subject-operational-drill',
        'session-operational-drill',
        'https://client-ok.example/backchannel/logout?client_secret=must-not-leak',
    );

    $job->handle(app(LogoutTokenService::class), app(RecordLogoutAuditEventAction::class));

    Http::assertSent(fn ($request): bool => is_string($request['logout_token']) && $request['logout_token'] !== '');
    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_succeeded'
                && data_get($payload, 'context.client_id') === 'client-ok'
                && data_get($payload, 'context.result') === 'succeeded'
                && data_get($payload, 'context.http_status') === 204
                && data_get($payload, 'context.logout_channel') === 'backchannel'
                && ! operational_drill_payload_contains_secret($payload);
        }));
});

function assertBackChannelFailureWarningWasSecretSafe(): void
{
    Log::shouldHaveReceived('warning')
        ->with('[BACKCHANNEL_LOGOUT_FAILED]', Mockery::on(function (array $context): bool {
            return ($context['client_id'] ?? null) === 'client-outage'
                && ($context['failure_class'] ?? null) === 'non_success_response'
                && ($context['http_status'] ?? null) === 503
                && data_get($context, 'endpoint.host') === 'client-outage.example'
                && ! operational_drill_payload_contains_secret($context);
        }));
}

function assertBackChannelFailureAuditWasSecretSafe(): void
{
    Log::shouldHaveReceived('info')
        ->with('[SSO_LOGOUT_AUDIT]', Mockery::on(function (array $payload): bool {
            return ($payload['event'] ?? null) === 'backchannel_logout_failed'
                && data_get($payload, 'context.client_id') === 'client-outage'
                && data_get($payload, 'context.failure_class') === 'non_success_response'
                && data_get($payload, 'context.http_status') === 503
                && ! operational_drill_payload_contains_secret($payload);
        }));
}

function operational_drill_payload_contains_secret(array $payload): bool
{
    $encoded = json_encode($payload, JSON_THROW_ON_ERROR);

    return str_contains($encoded, 'must-not-leak')
        || str_contains($encoded, 'access_token')
        || str_contains($encoded, 'client_secret')
        || str_contains($encoded, 'logout_token');
}
