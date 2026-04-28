<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Illuminate\Support\Facades\Http;
use RuntimeException;

final class SsoHttpClient
{
    public function authorizeUrl(string $state, string $challenge, string $nonce, ?string $prompt = null): string
    {
        $params = [
            'client_id' => config('services.sso.client_id'),
            'redirect_uri' => config('services.sso.redirect_uri'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ];

        if ($prompt !== null) {
            $params['prompt'] = $prompt;
        }

        return $this->publicUrl('/authorize').'?'.http_build_query($params);
    }

    /**
     * @return array<string, mixed>
     */
    public function exchangeCode(string $code, string $verifier): array
    {
        return $this->post('/token', [
            'grant_type' => 'authorization_code',
            'client_id' => config('services.sso.client_id'),
            'client_secret' => config('services.sso.client_secret'),
            'redirect_uri' => config('services.sso.redirect_uri'),
            'code' => $code,
            'code_verifier' => $verifier,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function refreshTokens(string $refreshToken): array
    {
        return $this->post('/token', [
            'grant_type' => 'refresh_token',
            'client_id' => config('services.sso.client_id'),
            'client_secret' => config('services.sso.client_secret'),
            'refresh_token' => $refreshToken,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function profile(string $accessToken): array
    {
        $response = Http::acceptJson()
            ->timeout(10)
            ->connectTimeout(5)
            ->withToken($accessToken)
            ->get(rtrim((string) config('services.resource_api.base_url'), '/').'/api/profile');

        return $this->payload($response->successful(), $response->json(), $response->status());
    }

    public function registerSession(string $accessToken): void
    {
        $this->post('/connect/register-session', [], $accessToken);
    }

    public function logout(string $accessToken): void
    {
        $this->post('/connect/logout', [], $accessToken);
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function post(string $path, array $body, ?string $accessToken = null): array
    {
        $request = Http::acceptJson()->timeout(10)->connectTimeout(5);
        $request = $accessToken === null ? $request : $request->withToken($accessToken);
        $response = $request->asJson()->post($this->internalUrl($path), $body);

        return $this->payload($response->successful(), $response->json(), $response->status());
    }

    private function publicUrl(string $path): string
    {
        return rtrim((string) config('services.sso.public_issuer'), '/').$path;
    }

    private function internalUrl(string $path): string
    {
        return rtrim((string) config('services.sso.internal_base_url'), '/').$path;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(bool $successful, mixed $payload, int $status): array
    {
        if (! $successful || ! is_array($payload)) {
            throw new RuntimeException(sprintf('SSO request failed with status %d.', $status));
        }

        return $payload;
    }
}
