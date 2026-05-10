<?php

declare(strict_types=1);

namespace App\Support\SsoErrors;

use App\Enums\SsoErrorCode;

final readonly class SsoErrorContext
{
    public function __construct(
        public SsoErrorCode $code,
        public string $safeReason,
        public string $technicalReason,
        public ?string $clientId = null,
        public ?string $redirectUri = null,
        public ?string $subjectId = null,
        public ?string $sessionId = null,
        public ?string $correlationId = null,
        public bool $retryAllowed = false,
        public bool $alternativeLoginAllowed = false,
    ) {}
}
