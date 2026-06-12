<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class PhoneChangeRequestedNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $otp,
        private readonly Carbon $expiresAt,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Kode Verifikasi Perubahan Nomor Telepon Dev-SSO')
            ->line('Gunakan kode berikut untuk memverifikasi perubahan nomor telepon akun Anda:')
            ->line('**'.$this->otp.'**')
            ->line('Kode ini berlaku hingga '.$this->formatDateTime($this->expiresAt).'.')
            ->line('Jika Anda tidak meminta perubahan ini, abaikan kode dan segera periksa keamanan akun Anda.');
    }
}
