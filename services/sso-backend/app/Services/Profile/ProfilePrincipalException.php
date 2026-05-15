<?php

declare(strict_types=1);

namespace App\Services\Profile;

use RuntimeException;

final class ProfilePrincipalException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $statusCode = 401,
    ) {
        parent::__construct($message);
    }
}
