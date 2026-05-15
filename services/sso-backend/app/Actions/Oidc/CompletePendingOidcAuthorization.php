<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Models\User;
use App\Services\Oidc\AuthorizationCodeStore;
use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Oidc\DownstreamClient;
use App\Support\Oidc\OidcContinuationResult;
use App\Support\Oidc\ScopeSet;
use Illuminate\Http\Request;

/**
 * BE-FR019-001 — Finalize a pending OIDC authorization request after MFA.
 *
 * Resumes the server-side authorization context that was bound to the MFA
 * challenge by `AuthenticateLocalCredentials`. The result mirrors what the
 * password-only path would have produced, but with `amr=['pwd','mfa']` and
 * `acr=urn:sso:loa:mfa`.
 *
 * The client never supplies the redemption parameters; this action reads
 * them from the trusted store, validates them again, and either issues
 * an authorization code or returns the consent redirect URI.
 */
final class CompletePendingOidcAuthorization
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly ScopePolicy $scopes,
        private readonly AuthorizationCodeStore $codes,
        private readonly AuthRequestStore $authRequests,
        private readonly ConsentService $consents,
        private readonly RecordAuthenticationAuditEventAction $audits,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(User $user, array $context, string $sessionId, Request $request): OidcContinuationResult
    {
        $clientId = $this->stringFrom($context, 'client_id');
        $redirectUri = $this->stringFrom($context, 'redirect_uri');
        $codeChallenge = $this->stringFrom($context, 'code_challenge');
        $state = $this->stringFrom($context, 'state');
        $nonce = $this->stringFrom($context, 'nonce');
        $scope = $this->stringFrom($context, 'scope') ?? 'openid';
        $codeChallengeMethod = $this->stringFrom($context, 'code_challenge_method') ?? 'S256';

        if ($clientId === null || $redirectUri === null || $codeChallenge === null
            || $state === null || $nonce === null || $codeChallengeMethod !== 'S256') {
            return OidcContinuationResult::invalidContext();
        }

        // BE-FR019-001: re-validate the bound client + redirect on every
        // continuation so a registry change between login and MFA verify
        // (suspend, decommission, redirect rotation) is honored.
        $client = $this->clients->resolve($clientId, $redirectUri);

        if (! $client instanceof DownstreamClient) {
            return OidcContinuationResult::invalidClient();
        }

        // BE-FR023-001: NEVER silently downgrade scope. If the policy has
        // tightened mid-flow, surface invalid_scope to the caller so the
        // pending authorization fails safe with no code.
        try {
            $validatedScope = $this->scopes->validateAuthorizationRequest($scope, $client);
        } catch (\RuntimeException $exception) {
            return OidcContinuationResult::invalidScope($exception->getMessage());
        }

        $payload = [
            'client_id' => $client->clientId,
            'redirect_uri' => $redirectUri,
            'scope' => $validatedScope,
            'nonce' => $nonce,
            'original_state' => $state,
            'downstream_code_challenge' => $codeChallenge,
            'session_id' => $sessionId,
            'subject_id' => $user->subject_id,
            'auth_time' => time(),
            'amr' => ['pwd', 'mfa'],
            'acr' => 'urn:sso:loa:mfa',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ];

        if ($this->requiresConsent($client, $user->subject_id, $validatedScope)) {
            $consentState = $this->authRequests->put($payload);

            if ($consentState === null) {
                return OidcContinuationResult::temporarilyUnavailable();
            }

            return OidcContinuationResult::consent(
                $this->consentRedirectUri($client, $validatedScope, $consentState),
            );
        }

        $code = $this->codes->issue($payload);

        $this->recordSuccess($request, $user, $client, $payload);

        $query = http_build_query(array_filter([
            'code' => $code,
            'state' => $state,
            'iss' => config('sso.issuer'),
        ]));

        $redirect = $redirectUri.(str_contains($redirectUri, '?') ? '&' : '?').$query;

        return OidcContinuationResult::authorizationCode($redirect);
    }

    private function requiresConsent(DownstreamClient $client, string $subjectId, string $scope): bool
    {
        if ($client->skipConsent) {
            return false;
        }

        return ! $this->consents->hasConsent($subjectId, $client->clientId, ScopeSet::fromString($scope));
    }

    private function consentRedirectUri(DownstreamClient $client, string $scope, string $state): string
    {
        $frontendUrl = rtrim((string) config('sso.frontend_url', ''), '/');

        return $frontendUrl.'/auth/consent?'.http_build_query([
            'client_id' => $client->clientId,
            'scope' => $scope,
            'state' => $state,
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function stringFrom(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function recordSuccess(Request $request, User $user, DownstreamClient $client, array $payload): void
    {
        $this->audits->execute(AuthenticationAuditRecord::authorizationRequestAccepted(
            clientId: $client->clientId,
            sessionId: $payload['session_id'] ?? null,
            subjectId: $user->subject_id,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            requestId: $request->headers->get('X-Request-Id'),
            context: [
                'auth_method' => 'local_password_mfa',
                'decision' => 'mfa_continuation_success',
                'scope' => $payload['scope'] ?? 'openid',
                'amr' => $payload['amr'] ?? ['pwd', 'mfa'],
                'acr' => $payload['acr'] ?? 'urn:sso:loa:mfa',
            ],
        ));
    }
}
