<?php

declare(strict_types=1);

namespace App\Http\Controllers\OAuth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Laravel\Passport\Client;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;

final class TokenRevocationController
{
    public function __invoke(Request $request): JsonResponse
    {
        $client = $this->confidentialClient($request);

        if (! $client instanceof Client) {
            return response()->json((object) []);
        }

        $token = $request->string('token')->toString();
        $hint = $request->string('token_type_hint')->toString();

        $this->revokeRefreshToken($token, $client, $hint);
        $this->revokeAccessToken($token, $client, $hint);

        return response()->json((object) []);
    }

    private function confidentialClient(Request $request): ?Client
    {
        $client = Client::query()->whereKey($request->string('client_id')->toString())->first();
        $secret = $request->string('client_secret')->toString();

        if (! $client instanceof Client || ! is_string($client->getAttribute('secret'))) {
            return null;
        }

        return Hash::check($secret, (string) $client->getAttribute('secret')) ? $client : null;
    }

    private function revokeRefreshToken(string $token, Client $client, string $hint): void
    {
        if ($hint !== 'refresh_token') {
            return;
        }

        RefreshToken::query()
            ->whereKey($token)
            ->whereHas('accessToken', fn ($query) => $query->where('client_id', $client->getKey()))
            ->update(['revoked' => true]);
    }

    private function revokeAccessToken(string $token, Client $client, string $hint): void
    {
        if ($hint === 'refresh_token') {
            return;
        }

        Token::query()
            ->whereKey($token)
            ->where('client_id', $client->getKey())
            ->update(['revoked' => true]);
    }
}
