<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-019 / UC-72: Suspicious login detected.
 *
 * Sent when the login risk evaluator determines that an authentication
 * attempt exceeds the medium-risk threshold — typically because the
 * request originated from a new IP address, a new device, or exhibited
 * high login velocity.
 */
final class SuspiciousLoginNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $ipAddress,
        private readonly string $userAgent,
        private readonly int $occurredAt,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Peringatan: Login Baru Terdeteksi')
            ->line(sprintf(
                'Kami mendeteksi login baru pada akun Anda pada %s.',
                $this->formatDateTime($this->occurredAt),
            ))
            ->line(sprintf(
                'Alamat IP: %s',
                $this->ipAddress,
            ))
            ->line(sprintf(
                'Perangkat: %s',
                $this->userAgent,
            ))
            ->action('Periksa Aktivitas Login', $this->frontendUrl('/sessions'))
            ->line('Jika Anda tidak mengenali aktivitas ini, segera ubah password dan hubungi administrator.');
    }
}
