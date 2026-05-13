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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = config('app.name', 'SSO');

        return $this->baseMail()
            ->subject("⚠️ Recovery Codes Hampir Habis — {$appName}")
            ->greeting('Perhatian!')
            ->line("Kamu hanya memiliki **{$this->remainingCodes}** recovery code tersisa.")
            ->line('Jika semua recovery codes habis, kamu tidak akan bisa login menggunakan metode pemulihan.')
            ->line('Segera regenerasi recovery codes baru untuk menjaga akses akun kamu.')
            ->action('Regenerasi Recovery Codes', url('/security/mfa'))
            ->line('Abaikan email ini jika kamu sudah meregenerasi kode baru.');
    }
}
