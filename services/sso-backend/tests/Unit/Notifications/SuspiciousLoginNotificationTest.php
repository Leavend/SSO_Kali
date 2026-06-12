<?php

declare(strict_types=1);

use App\Models\User;
use App\Notifications\SuspiciousLoginNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->user = User::factory()->create();
});

describe('SuspiciousLoginNotification', function (): void {
    it('renders mail message with login details', function (): void {
        $notification = new SuspiciousLoginNotification(
            ipAddress: '203.0.113.42',
            userAgent: 'Mozilla/5.0 TestAgent/1.0',
            occurredAt: 1717000000,
        );
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class)
            ->and($mail->subject)->toContain('Login Baru Terdeteksi');

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('203.0.113.42')
            ->and($rendered)->toContain('Mozilla/5.0 TestAgent/1.0');
    });

    it('includes secure-account action link', function (): void {
        $notification = new SuspiciousLoginNotification(
            ipAddress: '10.0.0.1',
            userAgent: 'TestAgent',
            occurredAt: time(),
        );
        $mail = $notification->toMail($this->user);

        expect($mail->actionUrl)->toBe(rtrim((string) config('sso.frontend_url'), '/').'/sessions')
            ->and($mail->actionText)->toContain('Periksa Aktivitas Login');
    });

    it('respects the security-notifications feature flag', function (): void {
        config()->set('security-notifications.enabled', false);

        $notification = new SuspiciousLoginNotification(
            ipAddress: '10.0.0.1',
            userAgent: 'TestAgent',
            occurredAt: time(),
        );

        expect($notification->shouldSend($this->user, 'mail'))->toBeFalse();
    });

    it('sends via mail channel by default', function (): void {
        $notification = new SuspiciousLoginNotification(
            ipAddress: '10.0.0.1',
            userAgent: 'TestAgent',
            occurredAt: time(),
        );

        expect($notification->via($this->user))->toBe(['mail']);
    });
});
