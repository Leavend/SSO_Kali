<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Exceptions\OidcScopeException;
use App\Models\SsoSession;
use App\Services\Directory\DirectoryUser;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

final readonly class CompleteLoginAuthorizationAction
{
    public function __construct(
        private AuthRequestStore $authRequests,
        private DownstreamClientRegistry $clients,
        private ScopePolicy $scopes,
        private AuthorizationCodeStore $codes,
    ) {}

    public function execute(
        string $authRequestId,
        DirectoryUser $user,
        SsoSession $session,
        Request $request,
    ): CompleteLoginAuthorizationResult {
        $context = $this->authRequests->pull($authRequestId);
        if ($context === null) {
            return CompleteLoginAuthorizationResult::error(
                'invalid_auth_request',
                'Authorization request expired or invalid.',
                400,
            );
        }

        $client = $this->client($context);
        if (! $client instanceof DownstreamClient) {
            return CompleteLoginAuthorizationResult::error(
                'invalid_client',
                'Unknown client or redirect URI.',
                400,
            );
        }

        try {
            $scope = $this->scopes->validateAuthorizationRequest($this->stringFrom($context, 'scope') ?? 'openid', $client);
        } catch (OidcScopeException $exception) {
            return CompleteLoginAuthorizationResult::error('invalid_scope', $exception->safeDescription(), 400);
        }

        $payload = [
            ...$context,
            'scope' => $scope,
            'session_id' => $session->session_id,
            'subject_id' => $user->subjectId,
            'auth_time' => $session->authenticated_at->getTimestamp(),
            'amr' => ['pwd'],
            'acr' => 'urn:sso:loa:password',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ];

        $code = $this->codes->issue($payload);

        return CompleteLoginAuthorizationResult::redirect(
            $this->callbackUri((string) $payload['redirect_uri'], $code, $payload),
        );
    }

    /** @param array<string, mixed> $context */
    private function client(array $context): ?DownstreamClient
    {
        return $this->clients->resolve(
            $this->stringFrom($context, 'client_id') ?? '',
            $this->stringFrom($context, 'redirect_uri') ?? '',
        );
    }

    /** @param array<string, mixed> $payload */
    private function callbackUri(string $redirectUri, string $code, array $payload): string
    {
        $query = http_build_query(array_filter([
            'code' => $code,
            'state' => $payload['original_state'] ?? null,
            'iss' => config('sso.issuer'),
        ]));

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;
    }

    /** @param array<string, mixed> $context */
    private function stringFrom(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }
}
