<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * FR-020 / UC-71: Base class for security notifications.
 *
 * All security-related notifications extend this class to ensure:
 *   - Consistent branding and layout.
 *   - Queue-able by default (non-blocking).
 *   - Feature flag check before sending.
 *   - Throttle-aware (subclasses can override).
 */
abstract class SecurityNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct()
    {
        $this->onQueue('notifications');
    }

    /**
     * Determine if the notification should be sent.
     */
    public function shouldSend(object $notifiable, string $channel): bool
    {
        return (bool) config('security-notifications.enabled', true);
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Build the mail message. Subclasses must implement this.
     */
    abstract public function toMail(object $notifiable): MailMessage;

    /**
     * Helper: create a base mail message with consistent branding.
     */
    protected function baseMail(): MailMessage
    {
        $appName = config('app.name', 'SSO');
        $mail = new MailMessage;

        $fromAddress = config('security-notifications.from_address', config('mail.from.address'));

        if (is_string($fromAddress) && $fromAddress !== '') {
            $mail->from(
                $fromAddress,
                config('security-notifications.from_name', $appName.' Security'),
            );
        }

        return $mail;
    }
}
