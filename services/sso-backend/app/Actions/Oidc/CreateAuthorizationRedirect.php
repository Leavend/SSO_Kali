<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\BrokerBrowserSession;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\HighAssuranceClientPolicy;
use App\Services\Oidc\OidcProfileMetrics;
use App\Services\Oidc\ScopePolicy;
use App\Services\Zitadel\ZitadelBrokerService;
use App\Support\Oidc\BrokerAuthFlowCookie;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\Pkce;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class CreateAuthorizationRedirect
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly AuthRequestStore $authRequests,
        private readonly AuthorizationCodeStore $codes,
        private readonly BrokerBrowserSession $browserSession,
        private readonly HighAssuranceClientPolicy $assurance,
        private readonly OidcProfileMetrics $metrics,
        private readonly BrokerAuthFlowCookie $authFlowCookie,
        private readonly ZitadelBrokerService $broker,
        private readonly ScopePolicy $scopes,
    ) {}

    public function handle(Request $request): JsonResponse|RedirectResponse
    {
        $client = $this->client($request);

        if ($client === null) {
            return OidcErrorResponse::json('invalid_client', 'Unknown client or redirect URI.', 400);
        }

        $error = $this->validationError($request);

        if ($error !== null) {
            return $this->invalidRequest($error);
        }

        $context = $this->context($request, $client);
        $browserContext = $this->browserSession->context($request);

        if ($browserContext !== null && $this->canUseBrowserSession($request, $client, $browserContext)) {
            return $this->localRedirect($context, $browserContext);
        }

        if ($this->prompt($request) === 'none') {
            return OidcErrorResponse::redirect(
                (string) $context['redirect_uri'],
                'login_required',
                'The request requires user interaction, but prompt=none was requested.',
                (string) ($context['original_state'] ?? ''),
            );
        }

        $upstreamState = $this->authRequests->put($context);

        if ($upstreamState === null) {
            return OidcErrorResponse::json(
                'temporarily_unavailable',
                'The authentication session could not be started. Please try again.',
                503,
            );
        }

        return redirect()
            ->away($this->broker->authorizationUrl($this->upstreamParameters($upstreamState, $context)))
            ->withCookie($this->authFlowCookie->issue($context));
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function canUseBrowserSession(Request $request, DownstreamClient $client, array $context): bool
    {
        if ($this->assurance->requiresInteractiveLogin($client)) {
            return false;
        }

        if (in_array($this->prompt($request), ['login', 'consent', 'select_account'], true)) {
            return false;
        }

        return $this->maxAgeIsFresh($request, $context);
    }

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>  $browserContext
     */
    private function localRedirect(array $context, array $browserContext): RedirectResponse
    {
        $payload = [...$context, ...$browserContext];
        $code = $this->codes->issue($payload);

        return redirect()->away($this->callbackUri((string) $payload['redirect_uri'], $code, $payload));
    }

    private function client(Request $request): ?DownstreamClient
    {
        return $this->clients->resolve($this->clientId($request), $this->redirectUri($request));
    }

    /**
     * @return array{reason: string, description: string}|null
     */
    private function validationError(Request $request): ?array
    {
        if ($this->clientId($request) === '' || $this->redirectUri($request) === '') {
            return $this->error('missing_client_binding', 'client_id and redirect_uri are required.');
        }

        if ($this->state($request) === null) {
            return $this->error('missing_state', 'state is required.');
        }

        if ($this->nonce($request) === null) {
            return $this->error('missing_nonce', 'nonce is required.');
        }

        if ($request->query('response_type') !== 'code') {
            return $this->error('unsupported_response_type', 'Only the authorization code flow is supported.');
        }

        if ($this->codeChallengeMethod($request) !== 'S256') {
            return $this->error('invalid_code_challenge_method', 'PKCE with S256 is required.');
        }

        if ($this->codeChallenge($request) === null) {
            return $this->error('missing_code_challenge', 'code_challenge is required.');
        }

        try {
            $this->scopes->validateAuthorizationRequest($this->scope($request), $this->client($request));
        } catch (\RuntimeException $exception) {
            return $this->error('invalid_scope', $exception->getMessage());
        }

        if ($this->invalidPromptRequested($request)) {
            return $this->error('invalid_prompt', 'Unsupported prompt value.');
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function context(Request $request, DownstreamClient $client): array
    {
        $upstreamVerifier = Pkce::generateVerifier();

        return [
            'client_id' => $client->clientId,
            'redirect_uri' => $this->redirectUri($request),
            'scope' => $this->scopes->validateAuthorizationRequest($this->scope($request), $client),
            'nonce' => $this->nonce($request),
            'original_state' => $this->state($request),
            'downstream_code_challenge' => (string) $this->codeChallenge($request),
            'session_id' => (string) Str::uuid(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'device_fingerprint' => $request->header('X-Device-Fingerprint'),
            'upstream_code_verifier' => $upstreamVerifier,
            'upstream_code_challenge' => Pkce::challengeFrom($upstreamVerifier),
            'prompt' => $this->assurance->upstreamPromptFor($client, $this->prompt($request)),
            'max_age' => $this->assurance->upstreamMaxAgeFor($client),
            'login_hint' => $request->query('login_hint'),
            'access_type' => $this->accessType($request),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    private function upstreamParameters(string $state, array $context): array
    {
        $scope = (string) config('sso.broker.scope');

        // When access_type=offline, ensure offline_access scope is included upstream
        // to request a refresh token from the upstream IdP (per Google's convention)
        if (($context['access_type'] ?? 'offline') === 'offline' && ! str_contains($scope, 'offline_access')) {
            $scope = trim($scope.' offline_access');
        }

        return array_filter([
            'client_id' => (string) config('sso.broker.client_id'),
            'redirect_uri' => (string) config('sso.broker.redirect_uri'),
            'response_type' => 'code',
            'scope' => $scope,
            'state' => $state,
            'nonce' => (string) $context['session_id'],
            'prompt' => is_string($context['prompt'] ?? null) ? $context['prompt'] : null,
            'max_age' => is_string($context['max_age'] ?? null) ? $context['max_age'] : null,
            'login_hint' => is_string($context['login_hint'] ?? null) ? $context['login_hint'] : null,
            'code_challenge' => (string) $context['upstream_code_challenge'],
            'code_challenge_method' => 'S256',
        ], static fn (?string $value): bool => $value !== null);
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

    private function state(Request $request): ?string
    {
        $state = $request->query('state');

        return is_string($state) && $state !== '' ? $state : null;
    }

    private function nonce(Request $request): ?string
    {
        $nonce = $request->query('nonce');

        return is_string($nonce) && $nonce !== '' ? $nonce : null;
    }

    private function codeChallengeMethod(Request $request): ?string
    {
        $method = $request->query('code_challenge_method');

        return is_string($method) && $method !== '' ? $method : null;
    }

    private function codeChallenge(Request $request): ?string
    {
        $challenge = $request->query('code_challenge');

        return is_string($challenge) && $challenge !== '' ? $challenge : null;
    }

    private function prompt(Request $request): ?string
    {
        $prompt = $request->query('prompt');

        if (! is_string($prompt) || $prompt === '') {
            return null;
        }

        // OpenID Connect Core §3.1.2.1 — valid prompt values
        return in_array($prompt, ['login', 'consent', 'select_account', 'none'], true)
            ? $prompt
            : null;
    }

    private function invalidPromptRequested(Request $request): bool
    {
        $prompt = $request->query('prompt');

        return is_string($prompt)
            && $prompt !== ''
            && ! in_array($prompt, ['login', 'consent', 'select_account', 'none'], true);
    }

    /**
     * Google-style access_type parameter.
     * - 'offline': requests a refresh token (adds offline_access scope upstream)
     * - 'online': standard flow without refresh token persistence
     * Defaults to 'offline' to match the existing behavior.
     */
    private function accessType(Request $request): string
    {
        $type = $request->query('access_type');

        return is_string($type) && $type === 'online' ? 'online' : 'offline';
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function maxAgeIsFresh(Request $request, array $context): bool
    {
        $maxAge = $request->query('max_age');
        if (! is_string($maxAge) || ! ctype_digit($maxAge)) {
            return true;
        }

        $authTime = is_int($context['auth_time'] ?? null) ? $context['auth_time'] : 0;

        return $maxAge !== '0' && $authTime > 0 && time() - $authTime <= (int) $maxAge;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function callbackUri(string $redirectUri, string $code, array $context): string
    {
        $query = http_build_query([
            'code' => $code,
            'state' => $context['original_state'] ?? null,
            'iss' => config('sso.issuer'),
        ]);

        return $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;
    }

    /**
     * @return array{reason: string, description: string}
     */
    private function error(string $reason, string $description): array
    {
        return [
            'reason' => $reason,
            'description' => $description,
        ];
    }

    /**
     * @param  array{reason: string, description: string}  $error
     */
    private function invalidRequest(array $error): JsonResponse
    {
        $this->metrics->incrementReject($error['reason']);

        return OidcErrorResponse::json('invalid_request', $error['description'], 400);
    }
}
