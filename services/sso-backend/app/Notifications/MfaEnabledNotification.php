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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appName = config('app.name', 'SSO');

        return $this->baseMail()
            ->subject("MFA Diaktifkan — {$appName}")
            ->greeting('Halo!')
            ->line("Multi-Factor Authentication ({$this->method}) telah diaktifkan pada akun kamu.")
            ->line('Jika kamu tidak melakukan ini, segera amankan akun kamu.')
            ->action('Kelola Keamanan Akun', url('/security/mfa'))
            ->line('Terima kasih telah menjaga keamanan akun kamu.');
    }
}
