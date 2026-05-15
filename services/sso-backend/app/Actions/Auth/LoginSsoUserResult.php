<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\SsoSession;
use App\Services\Directory\DirectoryUser;

final readonly class LoginSsoUserResult
{
    public function __construct(
        public bool $authenticated,
        public ?DirectoryUser $user = null,
        public ?SsoSession $session = null,
        public ?string $error = null,
        public ?int $retryAfter = null,
    ) {}
}
