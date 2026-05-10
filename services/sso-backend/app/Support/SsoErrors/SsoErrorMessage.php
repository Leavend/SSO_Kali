<?php

declare(strict_types=1);

namespace App\Support\SsoErrors;

final readonly class SsoErrorMessage
{
    public function __construct(
        public string $title,
        public string $message,
        public string $actionLabel,
        public bool $retryAllowed,
        public bool $alternativeLoginAllowed,
    ) {}
}
