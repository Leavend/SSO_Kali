<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\JsonResponse;

final class ClientController
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
    ) {}

    public function index(): JsonResponse
    {
        $clientIds = $this->clients->ids();
        $clients = [];

        foreach ($clientIds as $clientId) {
            $client = $this->clients->find($clientId);

            if ($client === null) {
                continue;
            }

            $clients[] = $this->payload($client);
        }

        return response()->json(['clients' => $clients]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(DownstreamClient $client): array
    {
        return [
            'client_id' => $client->clientId,
            'type' => $client->type,
            'redirect_uris' => $client->redirectUris,
            'backchannel_logout_uri' => $this->displayBackchannelUri($client->backchannelLogoutUri),
            'backchannel_logout_internal' => $this->isInternalUri($client->backchannelLogoutUri),
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
