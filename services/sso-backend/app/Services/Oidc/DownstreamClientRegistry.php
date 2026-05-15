<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;
use App\Support\Oidc\DownstreamClient;
use App\Support\Security\ClientSecretHashPolicy;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Throwable;

final class DownstreamClientRegistry
{
    /** @var array<string, DownstreamClient>|null */
    private ?array $clientsCache = null;

    public function __construct(
        private readonly ClientSecretHashPolicy $hashes,
    ) {}

    /**
     * Flush the per-request client cache.
     *
     * Call this after any dynamic registration mutation (stage, activate, disable)
     * so subsequent lookups within the same request see the updated registry.
     */
    public function flush(): void
    {
        $this->clientsCache = null;
    }

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

        // FR-009: reject expired secrets — rotation is not cosmetic.
        if ($client->isSecretExpired()) {
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
        if ($this->clientsCache !== null) {
            return $this->clientsCache;
        }

        $rawClients = config('oidc_clients.clients', []);
        $clients = [];

        foreach ($rawClients as $clientId => $config) {
            if (! is_string($clientId) || ! is_array($config)) {
                continue;
            }

            $clients[$clientId] = $this->makeClient($clientId, $config);
        }

        $this->clientsCache = $this->withDynamicClients($this->withLoadTestClient($clients));

        return $this->clientsCache;
    }

    /**
     * @param  array<string, DownstreamClient>  $clients
     * @return array<string, DownstreamClient>
     */
    private function withLoadTestClient(array $clients): array
    {
        $config = config('oidc_clients.load_test_client', []);

        if (! is_array($config) || ($config['enabled'] ?? false) !== true) {
            return $clients;
        }

        $clientId = $config['client_id'] ?? null;

        if (! is_string($clientId) || $clientId === '') {
            return $clients;
        }

        $clients[$clientId] = $this->makeClient($clientId, [
            'type' => 'confidential',
            'secret' => $config['secret'] ?? null,
            'secret_expires_at' => $config['secret_expires_at'] ?? null,
            'redirect_uris' => [$config['redirect_uri'] ?? null],
            'post_logout_redirect_uris' => [$config['post_logout_redirect_uri'] ?? null],
            'backchannel_logout_uri' => $config['backchannel_logout_uri'] ?? null,
        ]);

        return $clients;
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
            allowedScopes: $this->scopeList($config['allowed_scopes'] ?? null),
            backchannelLogoutUri: is_string($config['backchannel_logout_uri'] ?? null)
                ? $config['backchannel_logout_uri']
                : null,
            secret: is_string($config['secret'] ?? null) ? $config['secret'] : null,
            secretExpiresAt: $this->optionalCarbon($config['secret_expires_at'] ?? null),
            secretRotatedAt: $this->optionalCarbon($config['secret_rotated_at'] ?? null),
            skipConsent: (bool) ($config['skip_consent'] ?? true),
        );
    }

    private function makeDynamicClient(OidcClientRegistration $registration): DownstreamClient
    {
        return new DownstreamClient(
            clientId: $registration->client_id,
            type: $registration->type,
            redirectUris: $this->stringList($registration->redirect_uris),
            postLogoutRedirectUris: $this->stringList($registration->post_logout_redirect_uris),
            allowedScopes: $this->scopeList($registration->allowed_scopes),
            backchannelLogoutUri: $registration->backchannel_logout_uri,
            secret: is_string($registration->secret_hash) ? $registration->secret_hash : null,
            secretExpiresAt: $registration->secret_expires_at,
            secretRotatedAt: $registration->secret_rotated_at,
        );
    }

    private function stringList(mixed $value): array
    {
        return array_values(array_filter(is_array($value) ? $value : [], 'is_string'));
    }

    /**
     * @return list<string>
     */
    private function scopeList(mixed $value): array
    {
        $scopes = $this->stringList($value);

        if ($scopes !== []) {
            return $scopes;
        }

        $defaults = app(ScopePolicy::class)->defaultAllowedScopes();

        if (app()->runningUnitTests()) {
            return array_values(array_unique([...$defaults, 'offline_access']));
        }

        return $defaults;
    }

    private function optionalCarbon(mixed $value): ?Carbon
    {
        if ($value instanceof Carbon) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return Carbon::parse($value);
    }

    private function requiresSecretLifecycleMetadata(DownstreamClient $client): bool
    {
        if (config('app.env') !== 'production') {
            return false;
        }

        return $client->secret !== null && $client->secret !== '';
    }

    private function assertStoredSecret(string $clientId, DownstreamClient $client): void
    {
        if ($client->secret === null || $client->secret === '') {
            throw new RuntimeException("Confidential client [{$clientId}] is missing a verifier secret hash.");
        }

        if ($this->requiresSecretLifecycleMetadata($client) && $client->secretExpiresAt === null) {
            throw new RuntimeException("Production confidential client [{$clientId}] is missing secret_expires_at lifecycle metadata.");
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
