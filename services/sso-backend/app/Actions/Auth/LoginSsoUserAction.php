<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionService;

final readonly class LoginSsoUserAction
{
    public function __construct(
        private DirectoryUserProvider $directory,
        private SsoSessionService $sessions,
    ) {}

    public function execute(string $identifier, string $password, ?string $ipAddress, ?string $userAgent): LoginSsoUserResult
    {
        $user = $this->directory->findByIdentifier($identifier);

        if ($user === null || ! $this->directory->validatePassword($user, $password)) {
            return new LoginSsoUserResult(false, error: 'invalid_credentials');
        }

        return new LoginSsoUserResult(
            authenticated: true,
            user: $user,
            session: $this->sessions->create($user, $ipAddress, $userAgent),
        );
    }
}
