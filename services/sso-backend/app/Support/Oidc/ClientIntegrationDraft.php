<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class ClientIntegrationDraft
{
    public function __construct(
        public string $appName,
        public string $clientId,
        public string $environment,
        public string $clientType,
        public string $appBaseUrl,
        public string $callbackPath,
        public string $logoutPath,
        public string $ownerEmail,
        public string $provisioning,
    ) {}
}
