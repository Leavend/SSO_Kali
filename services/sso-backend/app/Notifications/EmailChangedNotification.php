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
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail()
            ->subject('Email SSO Berhasil Diubah — '.config('app.name', 'SSO'))
            ->greeting('Halo!')
            ->line('Email akun SSO kamu berhasil diubah menjadi '.$this->newEmail.' pada '.$this->changedAt->toIso8601String().'.')
            ->line('Jika kamu tidak melakukan perubahan ini, segera hubungi administrator.');
    }
}
