<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class AuthorizationRequestContextFactory
{
    public function __construct(
        private readonly ScopePolicy $scopes,
        private readonly HighAssuranceClientPolicy $assurance,
    ) {}

    /** @return array<string, mixed> */
    public function make(Request $request, DownstreamClient $client): array
    {
        return [
            'client_id' => $client->clientId,
            'redirect_uri' => (string) $request->query('redirect_uri', ''),
            'scope' => $this->scopes->validateAuthorizationRequest($this->scope($request), $client),
            'nonce' => $request->query('nonce'),
            'original_state' => $request->query('state'),
            'downstream_code_challenge' => (string) $request->query('code_challenge'),
            'code_challenge_method' => (string) $request->query('code_challenge_method'),
            'session_id' => (string) Str::uuid(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'device_fingerprint' => $request->header('X-Device-Fingerprint'),
            'prompt' => $this->assurance->promptFor($client, $this->prompt($request)),
            'max_age' => $this->assurance->maxAgeFor($client),
            'login_hint' => $request->query('login_hint'),
            'access_type' => $this->accessType($request),
        ];
    }

    private function scope(Request $request): string
    {
        return (string) $request->query('scope', 'openid');
    }

    private function prompt(Request $request): ?string
    {
        $prompt = $request->query('prompt');

        if (! is_string($prompt) || $prompt === '') {
            return null;
        }

        return in_array($prompt, ['login', 'consent', 'select_account', 'none'], true)
            ? $prompt
            : null;
    }

    private function accessType(Request $request): string
    {
        $type = $request->query('access_type');

        return is_string($type) && $type === 'online' ? 'online' : 'offline';
    }
}
