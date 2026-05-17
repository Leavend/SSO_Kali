<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Exceptions\OidcScopeException;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

final class AuthorizationRequestValidator
{
    public function __construct(private readonly ScopePolicy $scopes) {}

    /** @return array{reason: string, description: string}|null */
    public function validate(Request $request, DownstreamClient $client): ?array
    {
        if ($this->bindingMissing($request)) {
            return $this->error('missing_client_binding', 'client_id and redirect_uri are required.');
        }
        if (! $this->requiredString($request, 'state')) {
            return $this->error('missing_state', 'state is required.');
        }
        if (! $this->requiredString($request, 'nonce')) {
            return $this->error('missing_nonce', 'nonce is required.');
        }
        if ($request->query('response_type') !== 'code') {
            return $this->error('unsupported_response_type', 'Only the authorization code flow is supported.');
        }

        return $this->pkceOrScopeError($request, $client);
    }

    /** @return array{reason: string, description: string}|null */
    private function pkceOrScopeError(Request $request, DownstreamClient $client): ?array
    {
        if ($this->queryString($request, 'code_challenge_method') !== 'S256') {
            return $this->error('invalid_code_challenge_method', 'PKCE with S256 is required.');
        }
        if (! $this->requiredString($request, 'code_challenge')) {
            return $this->error('missing_code_challenge', 'code_challenge is required.');
        }
        if ($this->invalidPromptRequested($request)) {
            return $this->error('invalid_prompt', 'Unsupported prompt value.');
        }

        return $this->scopeError($request, $client);
    }

    /** @return array{reason: string, description: string}|null */
    private function scopeError(Request $request, DownstreamClient $client): ?array
    {
        try {
            $this->scopes->validateAuthorizationRequest($this->scope($request), $client);
        } catch (OidcScopeException $exception) {
            return $this->error('invalid_scope', $exception->safeDescription());
        }

        return null;
    }

    private function bindingMissing(Request $request): bool
    {
        return $this->clientId($request) === '' || $this->redirectUri($request) === '';
    }

    private function clientId(Request $request): string
    {
        return (string) $request->query('client_id', '');
    }

    private function redirectUri(Request $request): string
    {
        return (string) $request->query('redirect_uri', '');
    }

    private function scope(Request $request): string
    {
        return (string) $request->query('scope', 'openid');
    }

    private function requiredString(Request $request, string $key): bool
    {
        $value = $this->queryString($request, $key);

        return $value !== null && $value !== '';
    }

    private function queryString(Request $request, string $key): ?string
    {
        $value = $request->query($key);

        return is_string($value) ? $value : null;
    }

    private function invalidPromptRequested(Request $request): bool
    {
        $prompt = $request->query('prompt');

        return is_string($prompt)
            && $prompt !== ''
            && ! in_array($prompt, ['login', 'consent', 'select_account', 'none'], true);
    }

    /** @return array{reason: string, description: string} */
    private function error(string $reason, string $description): array
    {
        return ['reason' => $reason, 'description' => $description];
    }
}
