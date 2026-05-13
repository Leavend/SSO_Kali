<?php

declare(strict_types=1);

/**
 * FR-020 / UC-71: Security Notification Configuration.
 *
 * Controls the behavior of security-related email notifications
 * (MFA changes, recovery code usage, suspicious login, etc.).
 */

return [
    /*
    |--------------------------------------------------------------------------
    | Enable Security Notifications
    |--------------------------------------------------------------------------
    |
    | Master switch for all security notifications. Set to false to disable
    | all security emails (useful for testing or maintenance windows).
    |
    */
    'enabled' => (bool) env('SECURITY_NOTIFICATIONS_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | From Address & Name
    |--------------------------------------------------------------------------
    |
    | Override the default mail from address for security notifications.
    | Falls back to config('mail.from.*') if not set.
    |
    */
    'from_address' => env('SECURITY_NOTIFICATIONS_FROM_ADDRESS'),
    'from_name' => env('SECURITY_NOTIFICATIONS_FROM_NAME'),

    /*
    |--------------------------------------------------------------------------
    | Low Recovery Codes Threshold
    |--------------------------------------------------------------------------
    |
    | When remaining recovery codes drop to or below this number,
    | a warning notification is dispatched to the user.
    |
    */
    'low_recovery_codes_threshold' => (int) env('SECURITY_LOW_RECOVERY_THRESHOLD', 2),

    /*
    |--------------------------------------------------------------------------
    | Throttle (per user, per notification type)
    |--------------------------------------------------------------------------
    |
    | Maximum number of notifications of the same type that can be sent
    | to a single user within the cooldown window (in minutes).
    |
    */
    'throttle' => [
        'max_per_window' => 3,
        'window_minutes' => 60,
    ],
];
