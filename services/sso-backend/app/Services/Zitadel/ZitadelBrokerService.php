<?php

declare(strict_types=1);

namespace App\Services\Zitadel;

use Illuminate\Support\Facades\Http;

final class ZitadelBrokerService
{
    public function __construct(
        private readonly ZitadelMetadataService $metadata,
    ) {}

    /**
     * @param  array<string, string>  $parameters
     */
    public function authorizationUrl(array $parameters): string
    {
        $base = $this->metadata->publicEndpoint('authorization_endpoint');

        return $base.'?'.http_build_query($parameters);
    }

    /**
     * @param  array<string, string>  $payload
     * @return array<string, mixed>
     */
    public function token(array $payload): array
    {
        $response = Http::asForm()
            ->acceptJson()
            ->timeout(10)
            ->withHeaders($this->internalHostHeader())
            ->post($this->metadata->internalEndpoint('token_endpoint'), $payload);

        return (array) $response->throw()->json();
    }

    /**
     * @return array<string, mixed>
     */
    public function userInfo(string $accessToken): array
    {
        $response = Http::acceptJson()
            ->timeout(10)
            ->withToken($accessToken)
            ->withHeaders($this->internalHostHeader())
            ->get($this->metadata->internalEndpoint('userinfo_endpoint'));

        return (array) $response->throw()->json();
    }

    public function revoke(string $token, ?string $hint = null): void
    {
        Http::asForm()
            ->acceptJson()
            ->timeout(10)
            ->withHeaders($this->internalHostHeader())
            ->post($this->metadata->internalEndpoint('revocation_endpoint'), array_filter([
                'client_id' => config('sso.broker.client_id'),
                'client_secret' => config('sso.broker.client_secret'),
                'token' => $token,
                'token_type_hint' => $hint,
            ], static fn (?string $value): bool => $value !== null))
            ->throw();
    }

    /**
     * @param  array<string, string>  $parameters
     */
    public function endSessionUrl(array $parameters = []): string
    {
        $base = $this->metadata->publicEndpoint('end_session_endpoint');

        if ($parameters === []) {
            return $base;
        }

        return $base.'?'.http_build_query($parameters);
    }

    /**
     * When calling ZITADEL via Docker-internal URL (e.g. http://zitadel-api:8080),
     * ZITADEL resolves the instance from the Host header. We must pass the public
     * domain so ZITADEL can match its ExternalDomain configuration.
     *
     * @return array<string, string>
     */
    private function internalHostHeader(): array
    {
        $publicIssuer = (string) config('sso.broker.public_issuer');
        $host = parse_url($publicIssuer, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return [];
        }

        return ['Host' => $host];
    }
}
