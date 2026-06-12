<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * FR-020 / UC-71: Notification sent when MFA is enabled on an account.
 */
final class MfaEnabledNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $method = 'totp',
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Autentikasi Multi-Faktor Dev-SSO Berhasil Diaktifkan')
            ->line("Autentikasi multi-faktor ({$this->method}) telah diaktifkan pada akun Anda.")
            ->action('Kelola Keamanan Akun', $this->frontendUrl('/security/mfa'))
            ->line('Jika Anda tidak melakukan perubahan ini, segera amankan akun dan hubungi administrator.');
    }
}
