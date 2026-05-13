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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = config('app.name', 'SSO');

        $mail = $this->baseMail()
            ->subject("Recovery Code Digunakan — {$appName}")
            ->greeting('Halo!')
            ->line('Sebuah recovery code telah digunakan untuk login ke akun kamu.')
            ->line("IP Address: {$this->ipAddress}")
            ->line("Sisa recovery codes: **{$this->remainingCodes}**");

        if ($this->remainingCodes <= 2) {
            $mail->line('⚠️ Sisa recovery codes kamu sangat sedikit. Segera regenerasi kode baru.');
        }

        return $mail
            ->action('Kelola Recovery Codes', url('/security/mfa'))
            ->line('Jika kamu tidak melakukan login ini, segera amankan akun kamu.');
    }
}
