<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('records a complete failed login audit contract without sensitive leakage', function (): void {
    User::factory()->create([
        'email' => 'audit-user@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
        ->withHeader('User-Agent', 'Issue79AuditAgent/1.0')
        ->withHeader('X-Request-Id', 'req-login-failure-79')
        ->postJson('/api/auth/login', [
            'identifier' => 'audit-user@example.test',
            'password' => 'wrong-password-79',
            'auth_request_id' => 'auth-req-failure-79',
        ])->assertUnauthorized();

    $event = AuthenticationAuditEvent::query()->where('event_type', 'login_failed')->firstOrFail();
    $encodedContext = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('failed')
        ->and($event->email)->toBe('audit-user@example.test')
        ->and($event->subject_id)->not->toBeNull()
        ->and($event->session_id)->toBeNull()
        ->and($event->ip_address)->toBe('203.0.113.10')
        ->and($event->user_agent)->toBe('Issue79AuditAgent/1.0')
        ->and($event->request_id)->toBe('req-login-failure-79')
        ->and($event->error_code)->toBe('invalid_credentials')
        ->and($event->context)->toMatchArray(['auth_request_id' => 'auth-req-failure-79'])
        ->and($event->context['identifier_hash'] ?? null)->toBe(hash('sha256', 'audit-user@example.test'))
        ->and($encodedContext)->not->toContain('wrong-password-79')
        ->and($encodedContext)->not->toContain('audit-user@example.test');
});

it('records a complete successful login audit contract with session correlation', function (): void {
    $user = User::factory()->create([
        'email' => 'audit-success@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.11'])
        ->withHeader('User-Agent', 'Issue79AuditAgent/2.0')
        ->withHeader('X-Request-Id', 'req-login-success-79')
        ->postJson('/api/auth/login', [
            'identifier' => 'audit-success@example.test',
            'password' => 'correct-password',
            'auth_request_id' => 'auth-req-success-79',
        ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
    $event = AuthenticationAuditEvent::query()->where('event_type', 'login_succeeded')->firstOrFail();
    $encodedContext = json_encode($event->context, JSON_THROW_ON_ERROR);

    expect($event->outcome)->toBe('succeeded')
        ->and($event->subject_id)->toBe($user->subject_id)
        ->and($event->email)->toBe('audit-success@example.test')
        ->and($event->session_id)->toBe($sessionId)
        ->and($event->ip_address)->toBe('203.0.113.11')
        ->and($event->user_agent)->toBe('Issue79AuditAgent/2.0')
        ->and($event->request_id)->toBe('req-login-success-79')
        ->and($event->error_code)->toBeNull()
        ->and($event->context)->toMatchArray(['auth_request_id' => 'auth-req-success-79'])
        ->and($event->context['identifier_hash'] ?? null)->toBe(hash('sha256', 'audit-success@example.test'))
        ->and($encodedContext)->not->toContain('correct-password')
        ->and($encodedContext)->not->toContain('audit-success@example.test');
});
