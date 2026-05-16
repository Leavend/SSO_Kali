<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class PasswordChangedNotification extends SecurityNotification
{
    public function __construct(private readonly Carbon $changedAt)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail()
            ->subject('Password SSO Berhasil Diubah — '.config('app.name', 'SSO'))
            ->greeting('Halo!')
            ->line('Password akun SSO kamu berhasil diubah pada '.$this->changedAt->toIso8601String().'.')
            ->line('Semua sesi lain telah dicabut demi keamanan.')
            ->line('Jika kamu tidak melakukan perubahan ini, segera hubungi administrator.');
    }
}
