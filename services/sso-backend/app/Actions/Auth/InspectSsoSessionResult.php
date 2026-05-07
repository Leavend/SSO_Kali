<?php

declare(strict_types=1);

namespace App\Actions\Auth;

final readonly class InspectSsoSessionResult
{
    /**
     * @param  array<string, mixed>|null  $user
     */
    public function __construct(
        public bool $authenticated,
        public ?array $user = null,
    ) {}
}
