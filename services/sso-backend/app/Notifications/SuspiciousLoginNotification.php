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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = (string) config('app.name', 'SSO');
        $subject = "Login Baru Terdeteksi — {$appName}";
        $time = date('Y-m-d H:i:s', $this->occurredAt);

        return $this->baseMail()
            ->subject($subject)
            ->greeting('Halo!')
            ->line(sprintf(
                'Kami mendeteksi login baru pada akun Anda (%s).',
                $time,
            ))
            ->line(sprintf(
                'Alamat IP: %s',
                $this->ipAddress,
            ))
            ->line(sprintf(
                'Perangkat: %s',
                $this->userAgent,
            ))
            ->line('Jika kamu tidak merasa melakukan ini, segera ubah password kamu dan hubungi administrator.')
            ->action('Periksa Aktivitas Login', url('/sessions'));
    }
}
