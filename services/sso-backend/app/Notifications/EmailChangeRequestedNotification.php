<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class EmailChangeRequestedNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $token,
        private readonly Carbon $expiresAt,
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim((string) config('sso.frontend_url'), '/').'/profile/email-change/confirm?token='.urlencode($this->token);

        return $this->baseMail()
            ->subject('Konfirmasi Perubahan Email SSO — '.config('app.name', 'SSO'))
            ->greeting('Halo!')
            ->line('Gunakan tautan berikut untuk mengonfirmasi perubahan email akun SSO kamu.')
            ->line('Tautan ini berlaku sampai '.$this->expiresAt->toIso8601String().'.')
            ->action('Konfirmasi Email Baru', $url)
            ->line('Abaikan email ini jika kamu tidak meminta perubahan email.');
    }
}
