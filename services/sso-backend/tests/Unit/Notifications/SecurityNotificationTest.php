<?php

declare(strict_types=1);

namespace Tests\Unit\Notifications;

use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Notifications\EmailChangeRequestedNotification;
use App\Notifications\LowRecoveryCodesNotification;
use App\Notifications\MfaDisabledNotification;
use App\Notifications\MfaEnabledNotification;
use App\Notifications\PasswordChangedNotification;
use App\Notifications\PasswordResetRequestedNotification;
use App\Notifications\PhoneChangeRequestedNotification;
use App\Notifications\RecoveryCodesRegeneratedNotification;
use App\Notifications\RecoveryCodeUsedNotification;
use App\Notifications\RefreshTokenReuseDetectedNotification;
use App\Notifications\SuspiciousLoginNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

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
        expect($mail->subject)->toBe('Autentikasi Multi-Faktor Dev-SSO Berhasil Diaktifkan');
    });
});

describe('MfaDisabledNotification', function (): void {
    it('renders mail message for user-initiated removal', function (): void {
        $notification = new MfaDisabledNotification(byAdmin: false);
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toBe('Peringatan: Autentikasi Multi-Faktor Dev-SSO Dinonaktifkan');
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
        expect($mail->subject)->toBe('Peringatan: Recovery Code Dev-SSO Digunakan');

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
        expect($mail->subject)->toBe('Tindakan Diperlukan: Recovery Code Dev-SSO Hampir Habis');

        $rendered = implode(' ', $mail->introLines);
        expect($rendered)->toContain('2');
    });
});

describe('RecoveryCodesRegeneratedNotification', function (): void {
    it('renders mail message', function (): void {
        $notification = new RecoveryCodesRegeneratedNotification;
        $mail = $notification->toMail($this->user);

        expect($mail)->toBeInstanceOf(MailMessage::class);
        expect($mail->subject)->toBe('Recovery Code Dev-SSO Berhasil Diperbarui');
    });
});

it('renders branded mail without framework branding', function (): void {
    config()->set('security-notifications.support_address', 'support@dev-sso.example');

    $html = (string) (new MfaEnabledNotification)->toMail($this->user)->render();

    expect($html)
        ->toContain('Dev-SSO')
        ->toContain('#6366f1')
        ->toContain('support@dev-sso.example')
        ->not->toContain('Laravel');
});

it('keeps every security notification professional, named, and free of ISO timestamps', function (): void {
    config()->set('sso.frontend_url', 'https://sso.example.test');
    config()->set('sso.display_timezone', 'Asia/Makassar');
    config()->set('sso.auth.password_reset_ttl_minutes', 30);
    $this->user->forceFill(['display_name' => 'Ayu Lestari'])->save();
    $time = Carbon::parse('2026-06-09T14:53:53+00:00');

    $notifications = [
        new EmailChangeRequestedNotification('email-token', $time),
        new EmailChangedNotification('ayu.new@example.test', $time),
        new LowRecoveryCodesNotification(2),
        new MfaDisabledNotification,
        new MfaEnabledNotification,
        new PasswordChangedNotification($time),
        new PasswordResetRequestedNotification('reset-token', $time),
        new PhoneChangeRequestedNotification('123456', $time),
        new RecoveryCodeUsedNotification(4, '203.0.113.10'),
        new RecoveryCodesRegeneratedNotification,
        new RefreshTokenReuseDetectedNotification('sso-frontend-portal'),
        new SuspiciousLoginNotification('203.0.113.10', 'Browser Test', $time->timestamp),
    ];

    foreach ($notifications as $notification) {
        $mail = $notification->toMail($this->user);
        $content = implode(' ', [
            $mail->greeting,
            ...$mail->introLines,
            ...$mail->outroLines,
            $mail->salutation,
        ]);

        expect($mail->subject)->not->toBe('')
            ->and($mail->greeting)->toBe('Halo, Ayu Lestari')
            ->and($content)->not->toMatch('/\d{4}-\d{2}-\d{2}T/')
            ->and($mail->salutation)->toBe('Salam, Tim Keamanan Dev-SSO');

        if ($mail->actionUrl !== null) {
            expect($mail->actionUrl)->toStartWith('https://sso.example.test/');
        }
    }

    $resetMail = (new PasswordResetRequestedNotification('reset-token', $time))
        ->toMail($this->user);
    expect(implode(' ', $resetMail->introLines))
        ->toContain('berlaku 30 menit')
        ->toContain('9 Juni 2026, 22.53 WITA');
});
