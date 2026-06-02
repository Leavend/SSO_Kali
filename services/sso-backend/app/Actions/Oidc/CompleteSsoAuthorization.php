<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Exceptions\OidcScopeException;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\HighAssuranceClientPolicy;
use App\Services\Oidc\ScopePolicy;
use App\Services\Oidc\SsoSessionLifecycleGuard;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use App\Support\Oidc\DownstreamClient;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CompleteSsoAuthorization
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessions,
        private readonly AuthRequestStore $authRequests,
        private readonly DownstreamClientRegistry $clients,
        private readonly ScopePolicy $scopes,
        private readonly HighAssuranceClientPolicy $assurance,
        private readonly SsoSessionLifecycleGuard $sessionLifecycle,
        private readonly AuthorizationCodeStore $codes,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $authRequestId = (string) $request->input('auth_request_id', '');
        if ($authRequestId === '') {
            return OidcErrorResponse::json('invalid_request', 'auth_request_id is required.', 400);
        }

        $session = $this->sessions->current($this->cookies->resolve($request));
        if (! $session instanceof SsoSession) {
            return OidcErrorResponse::json('invalid_request', 'A valid SSO session is required.', 401);
        }

        $lifecycle = $this->sessionLifecycle->evaluate($session->subject_id);
        if (! $lifecycle->isAllowed()) {
            return OidcErrorResponse::json('access_denied', 'The SSO session can no longer be used.', 403);
        }

        $user = $lifecycle->user ?? User::query()->find($session->user_id);
        if (! $user instanceof User) {
            return OidcErrorResponse::json('invalid_request', 'A valid SSO session is required.', 401);
        }

        if ($user->role !== 'admin') {
            return OidcErrorResponse::json('access_denied', 'Admin role is required.', 403);
        }

        $context = $this->authRequests->peek($authRequestId);
        if ($context === null) {
            return OidcErrorResponse::json('invalid_request', 'Authorization request expired or invalid.', 400);
        }

        $client = $this->client($context);
        if (! $client instanceof DownstreamClient || $client->clientId !== $this->adminPanelClientId()) {
            return OidcErrorResponse::json('invalid_client', 'Unknown client or redirect URI.', 400);
        }

        if (! $this->freshEnough($session, $client, $context)) {
            return OidcErrorResponse::json('interaction_required', 'Fresh authentication is required.', 409);
        }

        $context = $this->authRequests->pull($authRequestId);
        if ($context === null) {
            return OidcErrorResponse::json('invalid_request', 'Authorization request expired or invalid.', 400);
        }

        try {
            $scope = $this->scopes->validateAuthorizationRequest($this->stringFrom($context, 'scope') ?? 'openid', $client);
        } catch (OidcScopeException $exception) {
            return OidcErrorResponse::json('invalid_scope', $exception->safeDescription(), 400);
        }

        $payload = [
            ...$context,
            'scope' => $scope,
            'session_id' => $session->session_id,
            'subject_id' => $user->subject_id,
            'auth_time' => $session->authenticated_at->getTimestamp(),
            'amr' => ['pwd'],
            'acr' => 'urn:sso:loa:password',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ];

        $code = $this->codes->issue($payload);

        return response()->json([
            'redirect_uri' => $this->callbackUri((string) $payload['redirect_uri'], $code, $payload),
        ])->withHeaders([
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ]);
    }

    /** @param array<string, mixed> $context */
    private function client(array $context): ?DownstreamClient
    {
        return $this->clients->resolve(
            $this->stringFrom($context, 'client_id') ?? '',
            $this->stringFrom($context, 'redirect_uri') ?? '',
        );
    }

    /** @param array<string, mixed> $context */
    private function freshEnough(SsoSession $session, DownstreamClient $client, array $context): bool
    {
        $maxAge = $this->stringFrom($context, 'max_age') ?? $this->assurance->maxAgeFor($client);
        if ($maxAge === null || ! ctype_digit($maxAge)) {
            return true;
        }

        return time() - $session->authenticated_at->getTimestamp() <= (int) $maxAge;
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

    private function adminPanelClientId(): string
    {
        return (string) config('sso.admin.panel_client_id', 'sso-admin-panel');
    }
}
