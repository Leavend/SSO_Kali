<?php

declare(strict_types=1);

use App\Models\AuthenticationAuditEvent;
use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('records failed login attempts without leaking credentials', function (): void {
    User::factory()->create([
        'email' => 'admin@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => 'admin@example.test',
        'password' => 'wrong-password',
    ])->assertUnauthorized();

    $event = AuthenticationAuditEvent::query()->firstOrFail();

    expect($event->event_type)->toBe('login_failed')
        ->and($event->outcome)->toBe('failed')
        ->and($event->email)->toBe('admin@example.test')
        ->and($event->error_code)->toBe('invalid_credentials')
        ->and($event->context)->toHaveKey('identifier_hash')
        ->and(json_encode($event->context, JSON_THROW_ON_ERROR))->not->toContain('wrong-password');
});

it('records successful login with subject and session context', function (): void {
    $user = User::factory()->create([
        'email' => 'admin@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => 'admin@example.test',
        'password' => 'correct-password',
    ])->assertOk();

    $sessionId = (string) SsoSession::query()->where('subject_id', $user->subject_id)->value('session_id');
    $event = AuthenticationAuditEvent::query()->where('event_type', 'login_succeeded')->firstOrFail();

    expect($event->outcome)->toBe('succeeded')
        ->and($event->subject_id)->toBe($user->subject_id)
        ->and($event->email)->toBe($user->email)
        ->and($event->session_id)->toBe($sessionId)
        ->and($event->occurred_at)->not->toBeNull();
});

it('prevents authentication audit mutation and deletion', function (): void {
    $event = AuthenticationAuditEvent::query()->create([
        'event_id' => '01HXAUTHAUDIT000000000001',
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'error_code' => 'invalid_credentials',
        'occurred_at' => now(),
    ]);

    expect(fn () => $event->update(['outcome' => 'changed']))->toThrow(RuntimeException::class)
        ->and(fn () => $event->delete())->toThrow(RuntimeException::class);
});
