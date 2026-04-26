<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\DownstreamClient;

final class HighAssuranceClientPolicy
{
    public function upstreamPromptFor(DownstreamClient $client, ?string $requestedPrompt): ?string
    {
        return $this->requiresInteractiveLogin($client) ? 'login' : $requestedPrompt;
    }

    public function upstreamMaxAgeFor(DownstreamClient $client): ?string
    {
        return $this->requiresInteractiveLogin($client) ? '0' : null;
    }

    public function requiresInteractiveLogin(DownstreamClient $client): bool
    {
        return $client->clientId === $this->adminPanelClientId();
    }

    private function adminPanelClientId(): string
    {
        return (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}
