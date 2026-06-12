<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;

final class PasswordChangedNotification extends SecurityNotification
{
    public function __construct(
        private readonly Carbon $changedAt,
        string $locale = 'id',
    ) {
        parent::__construct($locale);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMail($notifiable)
            ->subject('Password Akun Dev-SSO Berhasil Diubah')
            ->line('Password akun Anda berhasil diubah pada '.$this->formatDateTime($this->changedAt).'.')
            ->line('Sebagai perlindungan tambahan, seluruh sesi lain telah diakhiri.')
            ->action('Periksa Sesi Aktif', $this->frontendUrl('/sessions'))
            ->line('Jika Anda tidak melakukan perubahan ini, segera amankan akun dan hubungi administrator.');
    }
}
