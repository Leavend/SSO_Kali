<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;
use App\Support\Oidc\DownstreamClient;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Throwable;

final class DownstreamClientRegistry
{
    public function __construct(
        private readonly ClientSecretHashPolicy $hashes,
    ) {}

    public function find(string $clientId): ?DownstreamClient
    {
        return $this->clients()[$clientId] ?? null;
    }

    public function resolve(string $clientId, string $redirectUri): ?DownstreamClient
    {
        $client = $this->find($clientId);

        return $client?->allowsRedirectUri($redirectUri) ? $client : null;
    }

    public function validSecret(DownstreamClient $client, ?string $secret): bool
    {
        if (! $client->requiresClientSecret()) {
            return true;
        }

        if ($client->secret === null || $secret === null || $secret === '') {
            return false;
        }

        try {
            return $this->hashes->verify($secret, $client->secret);
        } catch (RuntimeException) {
            return false;
        }
    }

    public function assertStoredSecretsCompliant(): int
    {
        $count = 0;

        foreach ($this->clients() as $clientId => $client) {
            if (! $client->requiresClientSecret()) {
                continue;
            }

            $this->assertStoredSecret($clientId, $client);
            $count++;
        }

        return $count;
    }

    /**
     * @return list<string>
     */
    public function ids(): array
    {
        return array_keys($this->clients());
    }

    /**
     * @return array<string, DownstreamClient>
     */
    private function clients(): array
    {
        $rawClients = config('oidc_clients.clients', []);
        $clients = [];

        foreach ($rawClients as $clientId => $config) {
            if (! is_string($clientId) || ! is_array($config)) {
                continue;
            }

            $clients[$clientId] = $this->makeClient($clientId, $config);
        }

        return $this->withDynamicClients($clients);
    }

    /**
     * @param  array<string, DownstreamClient>  $clients
     * @return array<string, DownstreamClient>
     */
    private function withDynamicClients(array $clients): array
    {
        foreach ($this->dynamicRegistrations() as $registration) {
            if (isset($clients[$registration->client_id])) {
                continue;
            }

            $clients[$registration->client_id] = $this->makeDynamicClient($registration);
        }

        return $clients;
    }

    /**
     * @return iterable<OidcClientRegistration>
     */
    private function dynamicRegistrations(): iterable
    {
        try {
            if (! Schema::hasTable('oidc_client_registrations')) {
                return [];
            }

            return OidcClientRegistration::query()->where('status', 'active')->get();
        } catch (Throwable) {
            return [];
        }
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function makeClient(string $clientId, array $config): DownstreamClient
    {
        return new DownstreamClient(
            clientId: $clientId,
            type: (string) ($config['type'] ?? 'public'),
            redirectUris: array_values($config['redirect_uris'] ?? []),
            postLogoutRedirectUris: array_values($config['post_logout_redirect_uris'] ?? []),
            backchannelLogoutUri: is_string($config['backchannel_logout_uri'] ?? null)
                ? $config['backchannel_logout_uri']
                : null,
            secret: is_string($config['secret'] ?? null) ? $config['secret'] : null,
        );
    }

    private function makeDynamicClient(OidcClientRegistration $registration): DownstreamClient
    {
        return new DownstreamClient(
            clientId: $registration->client_id,
            type: $registration->type,
            redirectUris: $this->stringList($registration->redirect_uris),
            postLogoutRedirectUris: $this->stringList($registration->post_logout_redirect_uris),
            backchannelLogoutUri: $registration->backchannel_logout_uri,
            secret: is_string($registration->secret_hash) ? $registration->secret_hash : null,
        );
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        return array_values(array_filter(is_array($value) ? $value : [], 'is_string'));
    }

    private function assertStoredSecret(string $clientId, DownstreamClient $client): void
    {
        if ($client->secret === null || $client->secret === '') {
            throw new RuntimeException("Confidential client [{$clientId}] is missing a verifier secret hash.");
        }

        try {
            $this->hashes->assertCompliantHash($client->secret);
        } catch (RuntimeException $exception) {
            throw new RuntimeException(
                "Confidential client [{$clientId}] has a non-compliant verifier secret hash.",
                previous: $exception,
            );
        }
    }
}
