<?php

declare(strict_types=1);

namespace App\Actions\Auth;

final readonly class LogoutSsoSessionResult
{
    public function __construct(
        public bool $revoked,
        public ?string $sessionId,
        public ?string $subjectId,
    ) {}
}
