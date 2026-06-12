<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-020 / UC-71: Notification sent when a recovery code is used during login.
 *
 * Alerts the user that one of their recovery codes was consumed,
 * and includes the remaining count as a warning.
 */
final class RecoveryCodeUsedNotification extends SecurityNotification
{
    public function __construct(
        private readonly int $remainingCodes,
        private readonly string $ipAddress = 'unknown',
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = $this->baseMail($notifiable)
            ->subject('Peringatan: Recovery Code Dev-SSO Digunakan')
            ->line('Sebuah recovery code telah digunakan untuk masuk ke akun Anda.')
            ->line("Alamat IP: {$this->ipAddress}")
            ->line("Sisa recovery code: **{$this->remainingCodes}**");

        if ($this->remainingCodes <= 2) {
            $mail->line('Sisa recovery code Anda sangat sedikit. Segera buat kode baru.');
        }

        return $mail
            ->action('Kelola Recovery Code', $this->frontendUrl('/security/mfa'))
            ->line('Jika Anda tidak melakukan login ini, segera amankan akun dan hubungi administrator.');
    }
}
