<?php

declare(strict_types=1);

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\AuthenticationAuditEvent;
use App\Services\Audit\AuthenticationAuditEventStore;
use App\Services\Audit\AuthenticationAuditRedactor;
use App\Support\Audit\AuthenticationAuditRecord;
use Illuminate\Support\Facades\Log;

it('emits structured authentication audit persistence logs with correlation identifiers', function (): void {
    Log::spy();

    $event = app(RecordAuthenticationAuditEventAction::class)->execute(issue88AuditRecord([
        'eventType' => 'issue88_login_succeeded',
        'requestId' => 'req-issue88-persisted',
        'context' => ['access_token' => 'issue88-access-token-must-not-leak', 'safe' => 'visible'],
    ]));

    Log::shouldHaveReceived('info')
        ->once()
        ->with('[SSO_AUTHENTICATION_AUDIT_PERSISTED]', Mockery::on(
            fn (array $context): bool => $context === [
                'event_id' => $event->event_id,
                'event_type' => 'issue88_login_succeeded',
                'outcome' => 'succeeded',
                'request_id' => 'req-issue88-persisted',
                'client_id' => 'app-a',
                'subject_id' => 'issue88-subject',
                'error_code' => null,
            ],
        ));

    $encodedEvent = AuthenticationAuditEvent::query()->where('event_id', $event->event_id)->firstOrFail()->toJson(JSON_THROW_ON_ERROR);

    expect($encodedEvent)->not->toContain('issue88-access-token-must-not-leak')
        ->and($encodedEvent)->toContain('[REDACTED]');
});

it('emits structured authentication audit failure logs without leaking sensitive context', function (): void {
    Log::spy();
    $action = new RecordAuthenticationAuditEventAction(
        new class extends AuthenticationAuditEventStore
        {
            public function append(AuthenticationAuditRecord $record): AuthenticationAuditEvent
            {
                throw new RuntimeException('simulated audit storage outage');
            }
        },
        app(AuthenticationAuditRedactor::class),
    );

    expect(fn () => $action->execute(issue88AuditRecord([
        'eventType' => 'issue88_token_failed',
        'outcome' => 'failed',
        'requestId' => 'req-issue88-failed',
        'errorCode' => 'storage_unavailable',
        'context' => ['refresh_token' => 'issue88-refresh-token-must-not-leak'],
    ])))->toThrow(RuntimeException::class);

    Log::shouldHaveReceived('warning')
        ->once()
        ->with('[SSO_AUTHENTICATION_AUDIT_PERSISTENCE_FAILED]', Mockery::on(
            fn (array $context): bool => $context['event_type'] === 'issue88_token_failed'
                && $context['outcome'] === 'failed'
                && $context['request_id'] === 'req-issue88-failed'
                && $context['client_id'] === 'app-a'
                && $context['subject_id'] === 'issue88-subject'
                && $context['error_code'] === 'storage_unavailable'
                && str_contains((string) $context['reason'], 'simulated audit storage outage')
                && ! str_contains(json_encode($context, JSON_THROW_ON_ERROR), 'issue88-refresh-token-must-not-leak'),
        ));
});

it('exposes retention command observability output for compliance operations', function (): void {
    config()->set('sso.audit.authentication_retention_days', 90);
    app(RecordAuthenticationAuditEventAction::class)->execute(issue88AuditRecord([
        'eventType' => 'issue88_retention_candidate',
        'requestId' => 'req-issue88-retention',
        'occurredAt' => now()->subDays(100),
    ]));

    $this->artisan('sso:prune-authentication-audit-events --dry-run')
        ->expectsOutputToContain('Authentication audit retention days: 90')
        ->expectsOutputToContain('Authentication audit cutoff:')
        ->expectsOutputToContain('Authentication audit prune candidate row(s): 1')
        ->expectsOutputToContain('Dry run enabled; no authentication audit rows were pruned.')
        ->assertSuccessful();
});

/**
 * @param  array<string, mixed>  $overrides
 */
function issue88AuditRecord(array $overrides = []): AuthenticationAuditRecord
{
    return new AuthenticationAuditRecord(
        eventType: $overrides['eventType'] ?? 'issue88_event',
        outcome: $overrides['outcome'] ?? 'succeeded',
        subjectId: 'issue88-subject',
        email: 'issue88@example.com',
        clientId: 'app-a',
        sessionId: 'issue88-session',
        ipAddress: '203.0.113.188',
        userAgent: 'Issue88ObservabilityEvidence/1.0',
        errorCode: $overrides['errorCode'] ?? null,
        requestId: $overrides['requestId'] ?? 'req-issue88',
        context: $overrides['context'] ?? ['safe' => true],
        occurredAt: $overrides['occurredAt'] ?? now(),
    );
}
