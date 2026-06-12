<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class PasswordResetRequestedNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $token,
        private readonly Carbon $expiresAt,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->frontendUrl('/auth/reset-password?token='.urlencode($this->token));
        $ttlMinutes = (int) config('sso.auth.password_reset_ttl_minutes', 30);

        return $this->baseMail($notifiable)
            ->subject('Atur Ulang Password Akun Dev-SSO Anda')
            ->line('Kami menerima permintaan untuk mengatur ulang password akun Dev-SSO Anda.')
            ->line("Tautan ini berlaku {$ttlMinutes} menit, hingga ".$this->formatDateTime($this->expiresAt).'.')
            ->action('Atur Ulang Password', $url)
            ->line('Jika Anda tidak meminta perubahan ini, abaikan email dan segera periksa keamanan akun Anda.');
    }
}
