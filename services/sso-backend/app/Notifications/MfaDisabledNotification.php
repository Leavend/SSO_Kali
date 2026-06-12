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
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = $this->baseMail($notifiable)
            ->subject('Peringatan: Autentikasi Multi-Faktor Dev-SSO Dinonaktifkan')
            ->line('Autentikasi multi-faktor telah dinonaktifkan pada akun Anda.');

        if ($this->byAdmin) {
            $mail->line('Perubahan ini dilakukan oleh administrator sistem.');
        }

        return $mail
            ->line('Akun Anda sekarang hanya dilindungi oleh password.')
            ->action('Aktifkan Kembali MFA', $this->frontendUrl('/security/mfa'))
            ->line('Jika Anda tidak mengharapkan perubahan ini, segera amankan akun dan hubungi administrator.');
    }
}
