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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim((string) config('sso.frontend_url'), '/').'/auth/reset-password?token='.urlencode($this->token);

        return $this->baseMail()
            ->subject('Instruksi Reset Password — '.config('app.name', 'SSO'))
            ->greeting('Halo!')
            ->line('Kami menerima permintaan reset password untuk akun SSO kamu.')
            ->line('Tautan ini berlaku sampai '.$this->expiresAt->toIso8601String().'.')
            ->action('Reset Password', $url)
            ->line('Abaikan email ini jika kamu tidak meminta reset password.');
    }
}
