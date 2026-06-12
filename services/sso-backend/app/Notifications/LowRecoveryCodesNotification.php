<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-020 / UC-71: Notification sent when remaining recovery codes are critically low (≤ 2).
 */
final class LowRecoveryCodesNotification extends SecurityNotification
{
    public function __construct(
        private readonly int $remainingCodes,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Tindakan Diperlukan: Recovery Code Dev-SSO Hampir Habis')
            ->line("Anda hanya memiliki **{$this->remainingCodes}** recovery code tersisa.")
            ->line('Jika seluruh kode habis, metode pemulihan ini tidak dapat digunakan untuk login.')
            ->action('Buat Recovery Code Baru', $this->frontendUrl('/security/mfa'))
            ->line('Jika Anda sudah membuat kode baru, tidak ada tindakan tambahan yang diperlukan.');
    }
}
