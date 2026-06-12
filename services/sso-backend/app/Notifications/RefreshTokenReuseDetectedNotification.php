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
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Peringatan Keamanan: Penggunaan Ulang Token Terdeteksi')
            ->line(sprintf(
                'Sistem mendeteksi penggunaan ulang refresh token untuk aplikasi "%s".',
                $this->clientId,
            ))
            ->line('Sebagai tindakan pencegahan, seluruh sesi terkait telah diakhiri dan token akses aplikasi tersebut telah dicabut.')
            ->action('Periksa Sesi Aktif', $this->frontendUrl('/sessions'))
            ->line('Jika Anda tidak mengenali aktivitas ini, segera ubah password dan hubungi administrator.');
    }
}
