<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-020 / UC-71: Notification sent when recovery codes are regenerated.
 */
final class RecoveryCodesRegeneratedNotification extends SecurityNotification
{
    public function toMail(object $notifiable): MailMessage
    {
        $appName = config('app.name', 'SSO');

        return $this->baseMail()
            ->subject("Recovery Codes Diperbarui — {$appName}")
            ->greeting('Halo!')
            ->line('Recovery codes MFA kamu telah diperbarui. Kode lama sudah tidak berlaku.')
            ->line('Pastikan kamu menyimpan kode baru di tempat yang aman.')
            ->action('Kelola Keamanan Akun', url('/security/mfa'))
            ->line('Jika kamu tidak melakukan ini, segera amankan akun kamu.');
    }
}
