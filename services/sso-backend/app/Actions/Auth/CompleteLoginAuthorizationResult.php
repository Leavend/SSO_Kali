<?php

declare(strict_types=1);

namespace App\Actions\Auth;

final readonly class CompleteLoginAuthorizationResult
{
    private function __construct(
        public bool $completed,
        public ?string $redirectUri = null,
        public ?string $error = null,
        public ?string $message = null,
        public int $status = 200,
    ) {}

    public static function redirect(string $redirectUri): self
    {
        return new self(completed: true, redirectUri: $redirectUri);
    }

    public static function error(string $error, string $message, int $status): self
    {
        return new self(completed: false, error: $error, message: $message, status: $status);
    }
}
