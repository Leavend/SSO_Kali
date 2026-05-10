<?php

declare(strict_types=1);

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\AuthenticationAuditEvent;
use App\Services\Audit\AuthenticationAuditRetentionPolicy;
use App\Support\Audit\AuthenticationAuditRecord;

it('reports bounded authentication audit retention policy and candidate rows', function (): void {
    config()->set('sso.audit.authentication_retention_days', 30);
    issue87AuthenticationAuditEvent('old-login', now()->subDays(120));
    issue87AuthenticationAuditEvent('fresh-login', now()->subDays(10));

    $policy = app(AuthenticationAuditRetentionPolicy::class);
    $report = $policy->report(now()->subDays($policy->retentionDays()));

    expect($policy->retentionDays())->toBe(90)
        ->and($report['minimum_retention_days'])->toBe(90)
        ->and($report['maximum_retention_days'])->toBe(2555)
        ->and($report['candidate_count'])->toBe(1);
});

it('supports dry-run retention compliance without deleting authentication audit rows', function (): void {
    config()->set('sso.audit.authentication_retention_days', 90);
    issue87AuthenticationAuditEvent('old-dry-run', now()->subDays(100));
    issue87AuthenticationAuditEvent('fresh-dry-run', now()->subDays(2));

    $this->artisan('sso:prune-authentication-audit-events --dry-run')
        ->expectsOutputToContain('Authentication audit retention days: 90')
        ->expectsOutputToContain('Authentication audit prune candidate row(s): 1')
        ->expectsOutputToContain('Dry run enabled; no authentication audit rows were pruned.')
        ->assertSuccessful();

    expect(AuthenticationAuditEvent::query()->where('event_type', 'old-dry-run')->exists())->toBeTrue()
        ->and(AuthenticationAuditEvent::query()->where('event_type', 'fresh-dry-run')->exists())->toBeTrue();
});

it('prunes only authentication audit rows older than the retention cutoff using a bounded batch', function (): void {
    config()->set('sso.audit.authentication_retention_days', 90);
    issue87AuthenticationAuditEvent('old-prune-1', now()->subDays(100));
    issue87AuthenticationAuditEvent('old-prune-2', now()->subDays(101));
    issue87AuthenticationAuditEvent('fresh-prune', now()->subDays(1));

    $this->artisan('sso:prune-authentication-audit-events --limit=1')
        ->expectsOutputToContain('Authentication audit prune candidate row(s): 2')
        ->expectsOutputToContain('Pruned 1 authentication audit event row(s).')
        ->assertSuccessful();

    expect(AuthenticationAuditEvent::query()->whereIn('event_type', ['old-prune-1', 'old-prune-2'])->count())->toBe(1)
        ->and(AuthenticationAuditEvent::query()->where('event_type', 'fresh-prune')->exists())->toBeTrue();
});

function issue87AuthenticationAuditEvent(string $eventType, DateTimeInterface $occurredAt): void
{
    app(RecordAuthenticationAuditEventAction::class)->execute(new AuthenticationAuditRecord(
        eventType: $eventType,
        outcome: 'succeeded',
        subjectId: 'issue87-subject',
        email: 'issue87@example.com',
        clientId: 'app-a',
        sessionId: 'issue87-session',
        ipAddress: '203.0.113.187',
        userAgent: 'Issue87RetentionContract/1.0',
        errorCode: null,
        requestId: 'req-issue87-'.str_replace('_', '-', $eventType),
        context: ['retention_contract' => true],
        occurredAt: $occurredAt,
    ));
}
