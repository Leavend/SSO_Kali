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
        return $this->baseMail($notifiable)
            ->subject('Recovery Code Dev-SSO Berhasil Diperbarui')
            ->line('Recovery code akun Anda telah diperbarui dan seluruh kode lama tidak lagi berlaku.')
            ->line('Simpan kode baru di lokasi yang aman dan jangan membagikannya kepada siapa pun.')
            ->action('Kelola Keamanan Akun', $this->frontendUrl('/security/mfa'))
            ->line('Jika Anda tidak melakukan perubahan ini, segera amankan akun dan hubungi administrator.');
    }
}
