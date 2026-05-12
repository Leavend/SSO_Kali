<?php

declare(strict_types=1);

namespace App\Services\Admin;

final class AdminAuditTaxonomy
{
    public const CLIENT_INTEGRATION_ACTIVATED = 'client_integration_activated';

    public const CLIENT_INTEGRATION_DISABLED = 'client_integration_disabled';

    public const CLIENT_INTEGRATION_STAGED = 'client_integration_staged';

    public const CLIENT_SECRET_ROTATED = 'client_secret_rotated';

    public const DESTRUCTIVE_ACTION_WITH_STEP_UP = 'destructive_action_with_step_up';

    public const FORBIDDEN = 'forbidden';

    public const FRESH_AUTH_SUCCESS = 'fresh_auth_success';

    public const MFA_REQUIRED = 'mfa_required';

    public const PROFILE_SELF_UPDATE = 'profile_self_update';

    public const STALE_AUTH_REJECTED = 'stale_auth_rejected';

    public const TOO_MANY_ATTEMPTS = 'too_many_attempts';
}
