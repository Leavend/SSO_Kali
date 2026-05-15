<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\User;

final readonly class LocalPasswordLoginResult
{
    public function __construct(
        public LocalPasswordLoginOutcome $outcome,
        public ?User $user = null,
        public int $remainingAttempts = 0,
        public int $retryAfter = 0,
    ) {}

    public function authenticated(): bool
    {
        return $this->outcome === LocalPasswordLoginOutcome::Authenticated && $this->user instanceof User;
    }
}
