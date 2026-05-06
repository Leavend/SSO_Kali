<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\DownstreamClient;

final class HighAssuranceClientPolicy
{
    /**
     * Valid OIDC prompt values per OpenID Connect Core §3.1.2.1.
     * 'none' is intentionally excluded — the broker always requires interactive login for high-assurance clients.
     */
    private const VALID_PROMPTS = ['login', 'consent', 'select_account'];

    public function upstreamPromptFor(DownstreamClient $client, ?string $requestedPrompt): ?string
    {
        if ($this->requiresInteractiveLogin($client)) {
            return 'login';
        }

        // Pass through valid OIDC prompt values (login, consent, select_account) to the upstream IdP
        if ($requestedPrompt !== null && in_array($requestedPrompt, self::VALID_PROMPTS, true)) {
            return $requestedPrompt;
        }

        return $requestedPrompt;
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
