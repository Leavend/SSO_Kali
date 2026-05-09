<?php

declare(strict_types=1);

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\AuthenticationAuditEvent;
use App\Support\Audit\AuthenticationAuditRecord;

it('centralizes typed authentication audit persistence and recursive redaction', function (): void {
    app(RecordAuthenticationAuditEventAction::class)->execute(new AuthenticationAuditRecord(
        eventType: 'token_revoked',
        outcome: 'succeeded',
        subjectId: 'sub-central-audit',
        email: 'central@example.test',
        clientId: 'app-a',
        sessionId: 'sid-central-audit',
        ipAddress: '127.0.0.1',
        userAgent: 'Pest',
        errorCode: null,
        requestId: 'req-central-audit',
        context: [
            'refresh_token' => 'secret-refresh-token',
            'nested' => ['client_secret' => 'secret-client'],
            'safe' => 'kept',
        ],
        occurredAt: now(),
    ));

    $event = AuthenticationAuditEvent::query()->where('event_type', 'token_revoked')->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->client_id)->toBe('app-a')
        ->and($event->request_id)->toBe('req-central-audit')
        ->and($event->context)->toMatchArray([
            'refresh_token' => '[REDACTED]',
            'nested' => ['client_secret' => '[REDACTED]'],
            'safe' => 'kept',
        ]);
});

it('provides named factories for login audit event producers', function (): void {
    $success = AuthenticationAuditRecord::loginSucceeded(
        subjectId: 'sub-123',
        email: 'user@example.test',
        sessionId: 'sid-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Pest',
        context: ['identifier_hash' => 'hash'],
    );

    $failure = AuthenticationAuditRecord::loginFailed(
        subjectId: null,
        email: null,
        ipAddress: '127.0.0.1',
        userAgent: 'Pest',
        errorCode: 'invalid_credentials',
        context: ['identifier_hash' => 'hash'],
    );

    expect($success->eventType)->toBe('login_succeeded')
        ->and($success->outcome)->toBe('succeeded')
        ->and($success->sessionId)->toBe('sid-123')
        ->and($failure->eventType)->toBe('login_failed')
        ->and($failure->outcome)->toBe('failed')
        ->and($failure->errorCode)->toBe('invalid_credentials');
});
