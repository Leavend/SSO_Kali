<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use App\Enums\SsoSessionLifecycleOutcome;
use App\Models\User;

/**
 * FR-022: Outcome record for active SSO session lifecycle re-check.
 */
final readonly class SsoSessionLifecycleResult
{
    public function __construct(
        public SsoSessionLifecycleOutcome $outcome,
        public ?User $user = null,
    ) {}

    public function isAllowed(): bool
    {
        return $this->outcome === SsoSessionLifecycleOutcome::Allowed;
    }
}
