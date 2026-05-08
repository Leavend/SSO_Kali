<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Repositories\OidcClientRegistryRepository;
use App\Support\Oidc\DownstreamClient;

final class ValidateProductionOidcClientRegistryAction
{
    public function __construct(
        private readonly OidcClientRegistryRepository $clients,
    ) {}

    /**
     * @return array{valid: bool, checked_clients: int, checked_confidential_clients: int, errors: list<string>}
     */
    public function execute(): array
    {
        $errors = [];
        $registeredClients = $this->clients->all();

        array_push($errors, ...$this->validateLockedProductionClientIds($registeredClients));

        foreach ($registeredClients as $client) {
            array_push($errors, ...$this->validateClient($client));
        }

        try {
            $checkedConfidentialClients = $this->clients->assertConfidentialSecretsCompliant();
        } catch (\RuntimeException $exception) {
            $checkedConfidentialClients = 0;
            $errors[] = $exception->getMessage();
        }

        return [
            'valid' => $errors === [],
            'checked_clients' => count($registeredClients),
            'checked_confidential_clients' => $checkedConfidentialClients,
            'errors' => array_values(array_unique($errors)),
        ];
    }

    /**
     * @param  list<DownstreamClient>  $registeredClients
     * @return list<string>
     */
    private function validateLockedProductionClientIds(array $registeredClients): array
    {
        if (config('app.env') !== 'production') {
            return [];
        }

        $lockedClientIds = array_values(array_filter(
            config('oidc_clients.locked_production_client_ids', []),
            static fn (mixed $clientId): bool => is_string($clientId) && $clientId !== '',
        ));

        if ($lockedClientIds === []) {
            return ['Production OIDC client registry must define locked_production_client_ids.'];
        }

        $registeredClientIds = array_map(
            static fn (DownstreamClient $client): string => $client->clientId,
            $registeredClients,
        );

        $errors = [];

        foreach (array_values(array_diff($registeredClientIds, $lockedClientIds)) as $clientId) {
            $errors[] = "Production OIDC registry contains unexpected production client [{$clientId}].";
        }

        foreach (array_values(array_diff($lockedClientIds, $registeredClientIds)) as $clientId) {
            $errors[] = "Production OIDC registry is missing locked production client [{$clientId}].";
        }

        return $errors;
    }

    /**
     * @return list<string>
     */
    private function validateClient(DownstreamClient $client): array
    {
        $errors = [];

        if ($client->isPublic() && $client->secret !== null && $client->secret !== '') {
            $errors[] = "Public client [{$client->clientId}] must not define a client secret.";
        }

        if ($client->requiresClientSecret() && ($client->secret === null || $client->secret === '')) {
            $errors[] = "Confidential client [{$client->clientId}] must define a hashed client secret.";
        }

        foreach ([...$client->redirectUris, ...$client->postLogoutRedirectUris] as $uri) {
            array_push($errors, ...$this->validateProductionUri($client, $uri));
        }

        if ($client->backchannelLogoutUri !== null && $client->backchannelLogoutUri !== '') {
            array_push($errors, ...$this->validateProductionUri($client, $client->backchannelLogoutUri));
        }

        return $errors;
    }

    /**
     * @return list<string>
     */
    private function validateProductionUri(DownstreamClient $client, string $uri): array
    {
        $errors = [];
        $parsed = parse_url($uri);

        if ($uri === '' || str_contains($uri, '*')) {
            $errors[] = "Client [{$client->clientId}] contains an empty or wildcard URI.";
        }

        if ($parsed === false || ! isset($parsed['scheme'], $parsed['host'])) {
            return ["Client [{$client->clientId}] has malformed URI [{$uri}]."];
        }

        $isProduction = config('app.env') === 'production';

        if ($isProduction && $parsed['scheme'] !== 'https') {
            $errors[] = "Client [{$client->clientId}] production URI must use HTTPS [{$uri}].";
        }

        if ($isProduction && in_array($parsed['host'], ['localhost', '127.0.0.1', '::1'], true)) {
            $errors[] = "Client [{$client->clientId}] production URI must not target localhost [{$uri}].";
        }

        if (isset($parsed['fragment'])) {
            $errors[] = "Client [{$client->clientId}] URI must not include fragments [{$uri}].";
        }

        return $errors;
    }
}
