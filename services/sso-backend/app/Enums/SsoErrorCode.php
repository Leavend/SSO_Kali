<?php

declare(strict_types=1);

namespace App\Enums;

enum SsoErrorCode: string
{
    case InvalidRequest = 'invalid_request';
    case InvalidGrant = 'invalid_grant';
    case AccessDenied = 'access_denied';
    case LoginRequired = 'login_required';
    case InteractionRequired = 'interaction_required';
    case TemporarilyUnavailable = 'temporarily_unavailable';
    case NetworkError = 'network_error';
    case ServerError = 'server_error';
    case ConfigurationError = 'configuration_error';
    case SessionExpired = 'session_expired';
    case CsrfFailed = 'csrf_failed';
}
