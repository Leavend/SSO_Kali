<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-020 / UC-71: Notification sent when MFA is disabled on an account.
 */
final class MfaDisabledNotification extends SecurityNotification
{
    public function __construct(
        private readonly bool $byAdmin = false,
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = config('app.name', 'SSO');
        $subject = "MFA Dinonaktifkan — {$appName}";

        $mail = $this->baseMail()
            ->subject($subject)
            ->greeting('Halo!')
            ->line('Multi-Factor Authentication telah dinonaktifkan pada akun kamu.');

        if ($this->byAdmin) {
            $mail->line('Perubahan ini dilakukan oleh administrator sistem.');
        }

        return $mail
            ->line('Akun kamu sekarang hanya dilindungi oleh password.')
            ->action('Aktifkan Kembali MFA', url('/security/mfa'))
            ->line('Jika kamu tidak melakukan ini, segera hubungi administrator.');
    }
}
