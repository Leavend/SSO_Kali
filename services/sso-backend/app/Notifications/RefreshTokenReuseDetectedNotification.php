<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-033 / BE-FR033-001: Refresh token reuse detected.
 *
 * Sent when an OAuth 2.1 §6.1 reuse-detection trip fires — i.e. a
 * previously-rotated refresh token was presented again. The receiving
 * user is told the entire refresh family has been revoked and is asked
 * to sign in again from a trusted device.
 */
final class RefreshTokenReuseDetectedNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $clientId,
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = (string) config('app.name', 'SSO');
        $subject = "Aktivitas Mencurigakan Terdeteksi — {$appName}";

        return $this->baseMail()
            ->subject($subject)
            ->greeting('Halo!')
            ->line(sprintf(
                'Sistem mendeteksi penggunaan ulang refresh token untuk aplikasi "%s".',
                $this->clientId,
            ))
            ->line('Sebagai langkah pencegahan, semua sesi terkait sudah kami akhiri dan token akses pada aplikasi tersebut sudah dicabut.')
            ->action('Periksa Sesi Aktif', url('/sessions'))
            ->line('Jika kamu tidak merasa melakukan ini, segera ubah password kamu dan hubungi administrator.');
    }
}
