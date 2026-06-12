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
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->frontendUrl('/profile/email-change/confirm?token='.urlencode($this->token));

        return $this->baseMail($notifiable)
            ->subject('Konfirmasi Perubahan Email Akun Dev-SSO')
            ->line('Kami menerima permintaan untuk mengubah alamat email akun Dev-SSO Anda.')
            ->line('Tautan konfirmasi berlaku hingga '.$this->formatDateTime($this->expiresAt).'.')
            ->action('Konfirmasi Email Baru', $url)
            ->line('Jika Anda tidak meminta perubahan ini, jangan membuka tautan dan segera periksa keamanan akun Anda.');
    }
}
