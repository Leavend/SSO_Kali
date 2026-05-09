<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\OidcClientRegistration;
use App\Support\Oidc\DownstreamClient;

final class AdminClientPresenter
{
    /**
     * @return array<string, mixed>
     */
    public function downstream(DownstreamClient $client): array
    {
        return [
            'client_id' => $client->clientId,
            'type' => $client->type,
            'redirect_uris' => $client->redirectUris,
            'backchannel_logout_uri' => $this->displayBackchannelUri($client->backchannelLogoutUri),
            'backchannel_logout_internal' => $this->isInternalUri($client->backchannelLogoutUri),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function registration(OidcClientRegistration $registration): array
    {
        return [
            ...$registration->only([
                'client_id',
                'display_name',
                'type',
                'environment',
                'app_base_url',
                'redirect_uris',
                'post_logout_redirect_uris',
                'allowed_scopes',
                'backchannel_logout_uri',
                'owner_email',
                'provisioning',
                'status',
                'activated_at',
                'disabled_at',
            ]),
            'has_secret_hash' => is_string($registration->secret_hash) && $registration->secret_hash !== '',
        ];
    }

    private function displayBackchannelUri(?string $uri): ?string
    {
        if ($uri === null || $this->isInternalUri($uri)) {
            return null;
        }

        return $uri;
    }

    private function isInternalUri(?string $uri): bool
    {
        $host = is_string($uri) ? parse_url($uri, PHP_URL_HOST) : null;

        if (! is_string($host) || $host === '') {
            return false;
        }

        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return true;
        }

        return ! str_contains($host, '.') || $this->isPrivateIp($host);
    }

    private function isPrivateIp(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
