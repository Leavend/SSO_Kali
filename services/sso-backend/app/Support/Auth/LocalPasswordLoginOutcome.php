<?php

declare(strict_types=1);

namespace App\Support\Auth;

enum LocalPasswordLoginOutcome: string
{
    case Authenticated = 'authenticated';
    case InvalidCredentials = 'invalid_credentials';
    case AccountLocked = 'account_locked';
    case TooManyAttempts = 'too_many_attempts';
    case PasswordExpired = 'password_expired';
}
