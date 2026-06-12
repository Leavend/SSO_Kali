<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class EmailChangedNotification extends SecurityNotification
{
    public function __construct(
        private readonly string $newEmail,
        private readonly Carbon $changedAt,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Email Akun Dev-SSO Berhasil Diubah')
            ->line('Alamat email akun Anda telah diubah menjadi **'.$this->newEmail.'** pada '.$this->formatDateTime($this->changedAt).'.')
            ->action('Periksa Profil Akun', $this->frontendUrl('/profile'))
            ->line('Jika Anda tidak melakukan perubahan ini, segera amankan akun dan hubungi administrator.');
    }
}
