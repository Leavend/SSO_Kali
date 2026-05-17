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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail()
            ->subject('Kode Verifikasi Nomor Telepon SSO — '.config('app.name', 'SSO'))
            ->greeting('Halo!')
            ->line('Kode OTP perubahan nomor telepon kamu: '.$this->otp)
            ->line('Kode ini berlaku sampai '.$this->expiresAt->toIso8601String().'.')
            ->line('Abaikan email ini jika kamu tidak meminta perubahan nomor telepon.');
    }
}
