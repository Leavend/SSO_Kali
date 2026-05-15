<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\TokenClientCredentials;
use Illuminate\Http\Request;

final class TokenClientAuthenticationResolver
{
    public function resolve(Request $request): TokenClientCredentials
    {
        $basic = $this->fromBasicAuthorization($request);

        if ($basic !== null) {
            return $basic;
        }

        $clientId = $request->input('client_id');
        $clientSecret = $request->input('client_secret');

        return new TokenClientCredentials(
            clientId: is_string($clientId) ? $clientId : '',
            clientSecret: is_string($clientSecret) ? $clientSecret : null,
            authMethod: is_string($clientSecret) && $clientSecret !== '' ? 'client_secret_post' : 'none',
        );
    }

    private function fromBasicAuthorization(Request $request): ?TokenClientCredentials
    {
        $header = $request->headers->get('Authorization');

        if (! is_string($header) || ! str_starts_with($header, 'Basic ')) {
            return null;
        }

        $decoded = base64_decode(substr($header, 6), true);

        if (! is_string($decoded) || ! str_contains($decoded, ':')) {
            return new TokenClientCredentials('', null, 'client_secret_basic');
        }

        [$clientId, $clientSecret] = explode(':', $decoded, 2);

        return new TokenClientCredentials(
            clientId: rawurldecode($clientId),
            clientSecret: rawurldecode($clientSecret),
            authMethod: 'client_secret_basic',
        );
    }
}
