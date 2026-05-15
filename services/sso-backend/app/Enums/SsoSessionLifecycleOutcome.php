<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * FR-022 / UC-50, UC-55, UC-76: Active SSO session lifecycle outcomes.
 *
 * The SSO browser session must not be reused for issuing authorization
 * codes when the underlying account state has become invalid (disabled,
 * locked, password expired, MFA reset required, or removed).
 */
enum SsoSessionLifecycleOutcome: string
{
    case Allowed = 'allowed';
    case UserNotFound = 'user_not_found';
    case Disabled = 'disabled';
    case LocalAccountDisabled = 'local_account_disabled';
    case PasswordExpired = 'password_expired';
    case MfaResetRequired = 'mfa_reset_required';
}
