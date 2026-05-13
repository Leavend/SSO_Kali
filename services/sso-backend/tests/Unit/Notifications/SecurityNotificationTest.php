<?php

declare(strict_types=1);

namespace Tests\Unit\Notifications;

use App\Models\User;
use App\Notifications\LowRecoveryCodesNotification;
use App\Notifications\MfaDisabledNotification;
use App\Notifications\MfaEnabledNotification;
use App\Notifications\RecoveryCodesRegeneratedNotification;
use App\Notifications\RecoveryCodeUsedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->user = User::factory()->create();
});

describe('SecurityNotification base behavior', function (): void {
    it('respects the enabled feature flag', function (): void {
        config()->set('security-notifications.enabled', false);

        $notification = new MfaEnabledNotification;
        expect($notification->shouldSend($this->user, 'mail'))->toBeFalse();
    });

    it('sends when feature flag is enabled', function (): void {
        config()->set('security-notifications.enabled', true);

        $notification = new MfaEnabledNotification;
        expect($notification->shouldSend($this->user, 'mail'))->toBeTrue();
    });

    it('uses mail channel by default', function (): void {
        $notification = new MfaEnabledNotification;
        expect($notification->via($this->user))->toBe(['mail']);
    });

    it('is queued on the notifications queue', function (): void {
        $notification = new MfaEnabledNotification;
        expect($notification->queue)->toBe('notifications');
    });
});

describe('MfaEnabledNotification', function (): void {
    it('renders mail message with correct subject', function (): void {
        $notification = new MfaEnabledNotification('totp');
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toContain('MFA Diaktifkan');
    });
});

describe('MfaDisabledNotification', function (): void {
    it('renders mail message for user-initiated removal', function (): void {
        $notification = new MfaDisabledNotification(byAdmin: false);
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toContain('MFA Dinonaktifkan');
    });

    it('includes admin context when removed by admin', function (): void {
        $notification = new MfaDisabledNotification(byAdmin: true);
        $mail = $notification->toMail($this->user);

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('administrator');
    });
});

describe('RecoveryCodeUsedNotification', function (): void {
    it('renders mail with remaining count', function (): void {
        $notification = new RecoveryCodeUsedNotification(remainingCodes: 5, ipAddress: '192.168.1.1');
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toContain('Recovery Code Digunakan');

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('192.168.1.1');
        expect($rendered)->toContain('5');
    });

    it('includes warning when remaining codes are critically low', function (): void {
        $notification = new RecoveryCodeUsedNotification(remainingCodes: 1, ipAddress: '10.0.0.1');
        $mail = $notification->toMail($this->user);

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('sangat sedikit');
    });
});

describe('LowRecoveryCodesNotification', function (): void {
    it('renders mail with remaining count warning', function (): void {
        $notification = new LowRecoveryCodesNotification(remainingCodes: 2);
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toContain('Recovery Codes Hampir Habis');

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('2');
    });
});

describe('RecoveryCodesRegeneratedNotification', function (): void {
    it('renders mail message', function (): void {
        $notification = new RecoveryCodesRegeneratedNotification;
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toContain('Recovery Codes Diperbarui');
    });
});
